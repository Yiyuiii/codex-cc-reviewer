import type { ParsedDiffFile } from "./diff-parser.js";
import { truncateMiddle } from "../utils/truncate.js";

export type DiffInclusion = "full" | "partial" | "omitted";

export interface RouteDiffOptions {
  totalBudgetChars?: number;
  fullFileMaxChars?: number;
  maxManifestRows?: number;
  availableTools?: string[];
}

export interface RoutedDiffManifestRow {
  path: string;
  status: ParsedDiffFile["status"];
  inclusion: DiffInclusion;
  addedLines: number;
  deletedLines: number;
  changeSummary?: string;
  reason: string;
}

export interface RoutedDiffSection {
  path: string;
  inclusion: Exclude<DiffInclusion, "omitted">;
  reason: string;
  content: string;
  language?: string;
  omittedChars?: number;
}

export interface RoutedDiff {
  manifestRows: RoutedDiffManifestRow[];
  sections: RoutedDiffSection[];
  markdown: string;
}

const DEFAULT_TOTAL_BUDGET_CHARS = 80_000;
const DEFAULT_FULL_FILE_MAX_CHARS = 12_000;
const DEFAULT_MAX_MANIFEST_ROWS = 200;
const MIN_PARTIAL_CHARS = 120;
const GENERATED_RANK = 70;
const RAW_DIFF_FALLBACK_PATH = "[unparsed-diff]";
const DEFAULT_CONTEXT_ROUTING_GUIDANCE = [
  "Files marked `full` are included completely in this packet.",
  "Files marked `partial` preserve the beginning and end of the diff; the middle was omitted to keep the packet focused.",
  "Files marked `omitted` may still contain relevant evidence. Use Read, Grep, Bash, or other available Claude Code tools to inspect partial or omitted files when they matter.",
  "Do not treat omitted evidence as proof that no issue exists."
].join("\n");

interface ClassifiedDiffFile {
  file: ParsedDiffFile;
  risk: RiskClassification;
  originalIndex: number;
}

interface RiskClassification {
  rank: number;
  category: string;
}

export function routeDiffForReview(
  files: ParsedDiffFile[],
  options: RouteDiffOptions = {}
): RoutedDiff {
  const totalBudgetChars = options.totalBudgetChars ?? DEFAULT_TOTAL_BUDGET_CHARS;
  const fullFileMaxChars = options.fullFileMaxChars ?? DEFAULT_FULL_FILE_MAX_CHARS;
  const maxManifestRows = options.maxManifestRows ?? DEFAULT_MAX_MANIFEST_ROWS;
  const sections: RoutedDiffSection[] = [];
  const manifestRows: RoutedDiffManifestRow[] = [];
  let remainingBudget = Math.max(0, totalBudgetChars);
  const routedFiles = files
    .map((file, originalIndex): ClassifiedDiffFile => ({
      file,
      risk: classifyDiffRisk(file),
      originalIndex
    }))
    .sort(compareClassifiedDiffFiles);

  for (const { file, risk } of routedFiles) {
    const routed = routeFile(file, risk, remainingBudget, fullFileMaxChars);
    manifestRows.push({
      path: file.path,
      status: file.status,
      inclusion: routed.inclusion,
      addedLines: file.addedLines,
      deletedLines: file.deletedLines,
      reason: routed.reason
    });

    if (routed.section) {
      sections.push(routed.section);
      remainingBudget = Math.max(0, remainingBudget - routed.section.content.length);
    }
  }

  return {
    manifestRows,
    sections,
    markdown: formatRoutedDiffMarkdown(manifestRows, sections, maxManifestRows, options.availableTools)
  };
}

export function routeRawDiffFallbackForReview(
  rawDiff: string,
  options: RouteDiffOptions = {}
): RoutedDiff {
  const totalBudgetChars = options.totalBudgetChars ?? DEFAULT_TOTAL_BUDGET_CHARS;
  const maxManifestRows = options.maxManifestRows ?? DEFAULT_MAX_MANIFEST_ROWS;
  const content = truncateMiddle(rawDiff, Math.max(0, totalBudgetChars));
  const inclusion: Exclude<DiffInclusion, "omitted"> =
    rawDiff.length > Math.max(0, totalBudgetChars) ? "partial" : "full";
  const reason = "risk: unparseable; diff_parse_failed; raw_fallback";
  const manifestRows: RoutedDiffManifestRow[] = [
    {
      path: RAW_DIFF_FALLBACK_PATH,
      status: "unknown",
      inclusion,
      addedLines: 0,
      deletedLines: 0,
      changeSummary: "n/a",
      reason
    }
  ];
  const sections: RoutedDiffSection[] = [
    {
      path: RAW_DIFF_FALLBACK_PATH,
      inclusion,
      reason,
      content,
      language: "text",
      omittedChars: inclusion === "partial" ? Math.max(0, rawDiff.length - content.length) : undefined
    }
  ];

  return {
    manifestRows,
    sections,
    markdown: formatRoutedDiffMarkdown(manifestRows, sections, maxManifestRows, options.availableTools)
  };
}

function routeFile(
  file: ParsedDiffFile,
  risk: RiskClassification,
  remainingBudget: number,
  fullFileMaxChars: number
): {
  inclusion: DiffInclusion;
  reason: string;
  section?: RoutedDiffSection;
} {
  if (file.binary) {
    return { inclusion: "omitted", reason: formatReason(risk, "omitted") };
  }

  if (file.generated) {
    return { inclusion: "omitted", reason: formatReason(risk, "omitted") };
  }

  if (remainingBudget < MIN_PARTIAL_CHARS) {
    return { inclusion: "omitted", reason: formatReason(risk, "budget_exhausted") };
  }

  if (file.raw.length <= fullFileMaxChars && file.raw.length <= remainingBudget) {
    const reason = formatReason(risk, "source diff within budget");
    return {
      inclusion: "full",
      reason,
      section: {
        path: file.path,
        inclusion: "full",
        reason,
        content: file.raw
      }
    };
  }

  const partialBudget = Math.min(remainingBudget, Math.max(fullFileMaxChars, 2_000));
  if (partialBudget < MIN_PARTIAL_CHARS) {
    return { inclusion: "omitted", reason: formatReason(risk, "budget_exhausted") };
  }

  const content = truncateMiddle(file.raw, partialBudget);
  const reason = formatReason(risk, "truncated_to_budget");
  return {
    inclusion: "partial",
    reason,
    section: {
      path: file.path,
      inclusion: "partial",
      reason,
      content,
      omittedChars: Math.max(0, file.raw.length - content.length)
    }
  };
}

function compareClassifiedDiffFiles(left: ClassifiedDiffFile, right: ClassifiedDiffFile): number {
  if (left.risk.rank !== right.risk.rank) {
    return left.risk.rank - right.risk.rank;
  }

  if (left.file.raw.length !== right.file.raw.length) {
    return left.file.raw.length - right.file.raw.length;
  }

  return left.originalIndex - right.originalIndex;
}

function classifyDiffRisk(file: ParsedDiffFile): RiskClassification {
  if (file.binary) {
    return { rank: GENERATED_RANK, category: "binary" };
  }

  if (file.generated) {
    return { rank: GENERATED_RANK, category: "generated_or_lockfile" };
  }

  const normalized = file.path.replace(/\\/g, "/").toLowerCase();

  if (normalized.startsWith("src/mcp/")) {
    return { rank: 1, category: "mcp_transport" };
  }

  if (normalized.startsWith("src/runner/")) {
    return { rank: 1, category: "claude_runner" };
  }

  if (normalized.startsWith("src/review/")) {
    return { rank: 1, category: "review_packet" };
  }

  if (normalized.startsWith("src/config/")) {
    return { rank: 1, category: "config_surface" };
  }

  if (
    normalized === "src/index.ts" ||
    normalized.startsWith("src/cache/") ||
    normalized.startsWith("src/progress/")
  ) {
    return { rank: 1, category: "entrypoint" };
  }

  if (normalized.startsWith(".github/workflows/")) {
    return { rank: 2, category: "release_workflow" };
  }

  if (normalized === "package.json" || normalized === "agents.md") {
    return { rank: 2, category: "release_surface" };
  }

  if (
    normalized === "src/cli/install.ts" ||
    normalized === "src/cli/uninstall.ts" ||
    normalized === "src/cli/doctor.ts"
  ) {
    return { rank: 2, category: "install_surface" };
  }

  if (
    normalized === "readme.md" ||
    normalized === "readme.zh-cn.md" ||
    normalized === "docs/installation.md" ||
    normalized === "docs/codex-usage.md" ||
    normalized === "docs/tool-contract.md" ||
    normalized === "docs/troubleshooting.md"
  ) {
    return { rank: 2, category: "workflow_docs" };
  }

  if (hasSecurityOrConfigToken(normalized)) {
    return { rank: 3, category: "security_config" };
  }

  if (isTestPath(normalized)) {
    return { rank: 5, category: "tests" };
  }

  if (isSourcePath(normalized)) {
    return { rank: 4, category: "source" };
  }

  if (isDocsOrExamplePath(normalized)) {
    return { rank: 6, category: "docs" };
  }

  return { rank: 6, category: "other" };
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
  return /\.(?:cjs|cts|js|jsx|mjs|mts|ts|tsx)$/.test(path) || path.startsWith("src/");
}

function isTestPath(path: string): boolean {
  return /(^|\/)(tests?|__tests__)\//.test(path) || /\.(?:spec|test)\.(?:cjs|cts|js|jsx|mjs|mts|ts|tsx)$/.test(path);
}

function isDocsOrExamplePath(path: string): boolean {
  return path.startsWith("docs/") || path.startsWith("examples/") || /\.(?:md|mdx|txt)$/.test(path);
}

function formatReason(risk: RiskClassification, routeReason: string): string {
  return `risk: ${risk.category}; ${routeReason}`;
}

function formatRoutedDiffMarkdown(
  manifestRows: RoutedDiffManifestRow[],
  sections: RoutedDiffSection[],
  maxManifestRows: number,
  availableTools?: string[]
): string {
  const visibleRows = manifestRows.slice(0, maxManifestRows);
  const omittedManifestRows = Math.max(0, manifestRows.length - visibleRows.length);
  const manifest = [
    "## Changed Files Manifest",
    "",
    visibleRows.length
      ? [
          "| File | Status | Inclusion | +/- | Reason |",
          "| --- | --- | --- | --- | --- |",
          ...visibleRows.map(formatManifestRow)
        ].join("\n")
      : "No changed files were parsed from the git diff."
  ];

  if (omittedManifestRows > 0) {
    manifest.push(
      "",
      `${omittedManifestRows} additional changed files omitted from the manifest table. Use Git Evidence Summary or repository tools to inspect them if needed.`
    );
  }

  const evidence = sections.length
    ? sections.map(formatSection).join("\n\n")
    : "No diff bodies were included in the packet. Use the manifest, Git Evidence Summary, and repository tools if more evidence is needed.";

  return [
    manifest.join("\n"),
    "## Context Routing Guidance",
    formatContextRoutingGuidance(availableTools),
    "## Routed Git Diff Evidence",
    evidence
  ].join("\n\n");
}

function formatContextRoutingGuidance(availableTools: string[] | undefined): string {
  if (availableTools === undefined || availableTools.includes("default")) {
    return DEFAULT_CONTEXT_ROUTING_GUIDANCE;
  }

  return [
    "Files marked `full` are included completely in this packet.",
    "Files marked `partial` preserve the beginning and end of the diff; the middle was omitted to keep the packet focused.",
    `Files marked \`omitted\` may still contain relevant evidence. Use the available Claude Code tools (${availableTools.join(", ")}) to inspect partial or omitted files when they matter.`,
    "Do not treat omitted evidence as proof that no issue exists."
  ].join("\n");
}

function formatManifestRow(row: RoutedDiffManifestRow): string {
  return [
    "",
    escapeTableCell(row.path),
    escapeTableCell(row.status),
    escapeTableCell(row.inclusion),
    escapeTableCell(row.changeSummary ?? `+${row.addedLines}/-${row.deletedLines}`),
    escapeTableCell(row.reason),
    ""
  ].join(" | ");
}

function formatSection(section: RoutedDiffSection): string {
  const fence = markdownFenceFor(section.content);
  const language = section.language ?? "diff";
  return [
    `### ${section.path}`,
    "",
    `Inclusion: ${section.inclusion}`,
    `Reason: ${section.reason}`,
    section.omittedChars ? `Omitted chars: ${section.omittedChars}` : undefined,
    "",
    `${fence}${language}`,
    section.content,
    fence
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function markdownFenceFor(content: string): string {
  const longest = [...content.matchAll(/`+/g)].reduce(
    (maxLength, match) => Math.max(maxLength, match[0]?.length ?? 0),
    0
  );
  return "`".repeat(Math.max(3, longest + 1));
}
