import type { UntrackedFileEvidence } from "../git/untracked.js";
import { truncateMiddle } from "../utils/truncate.js";

export type UntrackedInclusion = "full" | "partial" | "omitted";

export interface RouteUntrackedOptions {
  totalBudgetChars?: number;
  fullFileMaxChars?: number;
  maxManifestRows?: number;
  contentRedacted?: boolean;
}

export interface RoutedUntrackedManifestRow {
  path: string;
  inclusion: UntrackedInclusion;
  sizeBytes?: number;
  reason: string;
  redacted: boolean;
}

export interface RoutedUntrackedSection {
  path: string;
  inclusion: Exclude<UntrackedInclusion, "omitted">;
  reason: string;
  content: string;
  omittedChars?: number;
}

export interface RoutedUntracked {
  manifestRows: RoutedUntrackedManifestRow[];
  sections: RoutedUntrackedSection[];
  markdown: string;
}

const DEFAULT_TOTAL_BUDGET_CHARS = 40_000;
const DEFAULT_FULL_FILE_MAX_CHARS = 16_000;
const DEFAULT_MAX_MANIFEST_ROWS = 200;
const MIN_PARTIAL_CHARS = 120;
const GENERATED_RANK = 70;

interface ClassifiedUntrackedFile {
  file: UntrackedFileEvidence;
  rank: number;
  originalIndex: number;
}

export function routeUntrackedForReview(
  files: UntrackedFileEvidence[],
  options: RouteUntrackedOptions = {}
): RoutedUntracked {
  const totalBudgetChars = options.totalBudgetChars ?? DEFAULT_TOTAL_BUDGET_CHARS;
  const fullFileMaxChars = options.fullFileMaxChars ?? DEFAULT_FULL_FILE_MAX_CHARS;
  const maxManifestRows = options.maxManifestRows ?? DEFAULT_MAX_MANIFEST_ROWS;
  const contentRedacted = options.contentRedacted ?? false;
  const manifestRows: RoutedUntrackedManifestRow[] = [];
  const sections: RoutedUntrackedSection[] = [];
  let remainingBudget = Math.max(0, totalBudgetChars);
  const routedFiles = files
    .map((file, originalIndex): ClassifiedUntrackedFile => ({
      file,
      rank: classifyUntrackedRisk(file),
      originalIndex
    }))
    .sort(compareClassifiedUntrackedFiles);

  for (const { file } of routedFiles) {
    const routed = routeUntrackedFile(file, remainingBudget, fullFileMaxChars, contentRedacted);
    manifestRows.push({
      path: file.path,
      inclusion: routed.inclusion,
      sizeBytes: file.sizeBytes,
      reason: routed.reason,
      redacted: routed.redacted
    });

    if (routed.section) {
      sections.push(routed.section);
      remainingBudget = Math.max(0, remainingBudget - routed.section.content.length);
    }
  }

  return {
    manifestRows,
    sections,
    markdown: formatUntrackedMarkdown(manifestRows, sections, maxManifestRows)
  };
}

function compareClassifiedUntrackedFiles(
  left: ClassifiedUntrackedFile,
  right: ClassifiedUntrackedFile
): number {
  if (left.rank !== right.rank) {
    return left.rank - right.rank;
  }

  const leftLength = left.file.content?.length ?? Number.MAX_SAFE_INTEGER;
  const rightLength = right.file.content?.length ?? Number.MAX_SAFE_INTEGER;
  if (leftLength !== rightLength) {
    return leftLength - rightLength;
  }

  return left.originalIndex - right.originalIndex;
}

function classifyUntrackedRisk(file: UntrackedFileEvidence): number {
  if (file.inclusion === "omitted") {
    return file.reason === "generated_or_lockfile" || file.reason === "binary_extension"
      ? GENERATED_RANK
      : 50;
  }

  const normalized = file.path.replace(/\\/g, "/").toLowerCase();

  if (
    normalized === ".env" ||
    normalized.startsWith("src/mcp/") ||
    normalized.startsWith("src/runner/") ||
    normalized.startsWith("src/review/") ||
    normalized.startsWith("src/config/") ||
    normalized === "src/index.ts"
  ) {
    return 1;
  }

  if (hasSecurityOrConfigToken(normalized)) {
    return 2;
  }

  if (isTestPath(normalized)) {
    return 4;
  }

  if (normalized.startsWith("src/") || isSourcePath(normalized)) {
    return 3;
  }

  if (normalized.startsWith("docs/") || normalized.startsWith("examples/")) {
    return 5;
  }

  return 6;
}

function hasSecurityOrConfigToken(path: string): boolean {
  const tokens = path.split(/[\/._-]+/).filter(Boolean);
  return tokens.some((token) =>
    [
      "security",
      "auth",
      "permission",
      "permissions",
      "secret",
      "secrets",
      "token",
      "tokens",
      "credential",
      "credentials",
      "config",
      "env"
    ].includes(token)
  );
}

function isSourcePath(path: string): boolean {
  return /\.(?:cjs|cts|js|jsx|mjs|mts|ts|tsx)$/.test(path);
}

function isTestPath(path: string): boolean {
  return /(^|\/)(tests?|__tests__)\//.test(path) || /\.(?:spec|test)\.(?:cjs|cts|js|jsx|mjs|mts|ts|tsx)$/.test(path);
}

function routeUntrackedFile(
  file: UntrackedFileEvidence,
  remainingBudget: number,
  fullFileMaxChars: number,
  contentRedacted: boolean
): {
  inclusion: UntrackedInclusion;
  reason: string;
  redacted: boolean;
  section?: RoutedUntrackedSection;
} {
  if (file.inclusion === "omitted") {
    return { inclusion: "omitted", reason: file.reason, redacted: false };
  }

  if (remainingBudget < MIN_PARTIAL_CHARS) {
    return { inclusion: "omitted", reason: `${file.reason}; budget_exhausted`, redacted: false };
  }

  const content = file.content ?? "";
  const embeddedReason = contentRedacted
    ? "embedded with redactSecrets=true"
    : "embedded raw because redactSecrets=false";

  if (content.length <= fullFileMaxChars && content.length <= remainingBudget) {
    const reason = `${file.reason}; ${embeddedReason}`;
    return {
      inclusion: "full",
      reason,
      redacted: contentRedacted,
      section: {
        path: file.path,
        inclusion: "full",
        reason,
        content
      }
    };
  }

  const partialBudget = Math.min(remainingBudget, fullFileMaxChars);
  if (partialBudget < MIN_PARTIAL_CHARS) {
    return { inclusion: "omitted", reason: `${file.reason}; budget_exhausted`, redacted: false };
  }

  const routedContent = truncateMiddle(content, partialBudget);
  const reason = `${file.reason}; truncated_to_budget; ${embeddedReason}`;
  return {
    inclusion: "partial",
    reason,
    redacted: contentRedacted,
    section: {
      path: file.path,
      inclusion: "partial",
      reason,
      content: routedContent,
      omittedChars: Math.max(0, content.length - routedContent.length)
    }
  };
}

function formatUntrackedMarkdown(
  manifestRows: RoutedUntrackedManifestRow[],
  sections: RoutedUntrackedSection[],
  maxManifestRows: number
): string {
  const visibleRows = manifestRows.slice(0, maxManifestRows);
  const omittedManifestRows = Math.max(0, manifestRows.length - visibleRows.length);
  const manifest = [
    "## Untracked Files Manifest",
    "",
    visibleRows.length
      ? [
          "| File | Inclusion | Bytes | Reason | Redacted |",
          "| --- | --- | ---: | --- | --- |",
          ...visibleRows.map(formatManifestRow)
        ].join("\n")
      : "No untracked files were selected for body routing."
  ];

  if (omittedManifestRows > 0) {
    manifest.push(
      "",
      `${omittedManifestRows} additional untracked files omitted from the manifest table. Use repository tools to inspect them if needed.`
    );
  }

  const evidence = sections.length
    ? sections.map(formatSection).join("\n\n")
    : "No untracked file bodies were included in the packet. Use the manifest and repository tools if more evidence is needed.";

  return [
    manifest.join("\n"),
    "## Untracked Content Routing Guidance",
    [
      "Files marked `full` are included completely in this packet.",
      "Files marked `partial` preserve the beginning and end of the file; the middle was omitted to keep the packet focused.",
      "Files marked `omitted` may still contain relevant evidence. Use Read, Grep, Bash, or other available Claude Code tools to inspect them when they matter.",
      "No file is omitted only because its filename looks sensitive; `redactSecrets=true` controls best-effort content redaction."
    ].join("\n"),
    "## Routed Untracked File Evidence",
    evidence
  ].join("\n\n");
}

function formatManifestRow(row: RoutedUntrackedManifestRow): string {
  return [
    "",
    escapeTableCell(row.path),
    escapeTableCell(row.inclusion),
    row.sizeBytes ?? "unknown",
    escapeTableCell(row.reason),
    row.redacted ? "yes" : "no",
    ""
  ].join(" | ");
}

function formatSection(section: RoutedUntrackedSection): string {
  const fence = markdownFenceFor(section.content);
  return [
    `### ${section.path}`,
    "",
    `Inclusion: ${section.inclusion}`,
    `Reason: ${section.reason}`,
    section.omittedChars ? `Omitted chars: ${section.omittedChars}` : undefined,
    "",
    `${fence}text`,
    section.content,
    fence
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
}

function markdownFenceFor(content: string): string {
  const longest = [...content.matchAll(/`+/g)].reduce(
    (maxLength, match) => Math.max(maxLength, match[0]?.length ?? 0),
    0
  );
  return "`".repeat(Math.max(3, longest + 1));
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}
