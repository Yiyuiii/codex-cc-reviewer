import type { ParsedDiffFile } from "./diff-parser.js";
import { truncateMiddle } from "../utils/truncate.js";

export type DiffInclusion = "full" | "partial" | "omitted";

export interface RouteDiffOptions {
  totalBudgetChars?: number;
  fullFileMaxChars?: number;
  maxManifestRows?: number;
}

export interface RoutedDiffManifestRow {
  path: string;
  status: ParsedDiffFile["status"];
  inclusion: DiffInclusion;
  addedLines: number;
  deletedLines: number;
  reason: string;
}

export interface RoutedDiffSection {
  path: string;
  inclusion: Exclude<DiffInclusion, "omitted">;
  reason: string;
  content: string;
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

  for (const file of files) {
    const routed = routeFile(file, remainingBudget, fullFileMaxChars);
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
    markdown: formatRoutedDiffMarkdown(manifestRows, sections, maxManifestRows)
  };
}

function routeFile(
  file: ParsedDiffFile,
  remainingBudget: number,
  fullFileMaxChars: number
): {
  inclusion: DiffInclusion;
  reason: string;
  section?: RoutedDiffSection;
} {
  if (file.binary) {
    return { inclusion: "omitted", reason: "binary" };
  }

  if (file.generated) {
    return { inclusion: "omitted", reason: "generated_or_lockfile" };
  }

  if (remainingBudget < MIN_PARTIAL_CHARS) {
    return { inclusion: "omitted", reason: "budget_exhausted" };
  }

  if (file.raw.length <= fullFileMaxChars && file.raw.length <= remainingBudget) {
    return {
      inclusion: "full",
      reason: "source diff within budget",
      section: {
        path: file.path,
        inclusion: "full",
        reason: "source diff within budget",
        content: file.raw
      }
    };
  }

  const partialBudget = Math.min(remainingBudget, Math.max(fullFileMaxChars, 2_000));
  if (partialBudget < MIN_PARTIAL_CHARS) {
    return { inclusion: "omitted", reason: "budget_exhausted" };
  }

  const content = truncateMiddle(file.raw, partialBudget);
  return {
    inclusion: "partial",
    reason: "truncated_to_budget",
    section: {
      path: file.path,
      inclusion: "partial",
      reason: "truncated_to_budget",
      content,
      omittedChars: Math.max(0, file.raw.length - content.length)
    }
  };
}

function formatRoutedDiffMarkdown(
  manifestRows: RoutedDiffManifestRow[],
  sections: RoutedDiffSection[],
  maxManifestRows: number
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
    [
      "Files marked `full` are included completely in this packet.",
      "Files marked `partial` preserve the beginning and end of the diff; the middle was omitted to keep the packet focused.",
      "Files marked `omitted` may still contain relevant evidence. Use Read, Grep, Bash, or other available Claude Code tools to inspect partial or omitted files when they matter.",
      "Do not treat omitted evidence as proof that no issue exists."
    ].join("\n"),
    "## Routed Git Diff Evidence",
    evidence
  ].join("\n\n");
}

function formatManifestRow(row: RoutedDiffManifestRow): string {
  return [
    "",
    escapeTableCell(row.path),
    escapeTableCell(row.status),
    escapeTableCell(row.inclusion),
    `+${row.addedLines}/-${row.deletedLines}`,
    escapeTableCell(row.reason),
    ""
  ].join(" | ");
}

function formatSection(section: RoutedDiffSection): string {
  return [
    `### ${section.path}`,
    "",
    `Inclusion: ${section.inclusion}`,
    `Reason: ${section.reason}`,
    section.omittedChars ? `Omitted chars: ${section.omittedChars}` : undefined,
    "",
    "```diff",
    section.content,
    "```"
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}
