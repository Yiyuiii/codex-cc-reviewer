import { describe, expect, it } from "vitest";

import {
  routeDiffForReview,
  routeRawDiffFallbackForReview
} from "../src/review/context-router.js";
import { parseUnifiedDiff, type ParsedDiffFile } from "../src/review/diff-parser.js";

describe("routeDiffForReview", () => {
  it("includes small source diffs fully", () => {
    const files = parseUnifiedDiff([
      "diff --git a/src/foo.ts b/src/foo.ts",
      "index 1111111..2222222 100644",
      "--- a/src/foo.ts",
      "+++ b/src/foo.ts",
      "@@ -1 +1,2 @@",
      " const keep = true;",
      "+export const added = true;"
    ].join("\n"));

    const routed = routeDiffForReview(files, { totalBudgetChars: 4_000 });

    expect(routed.manifestRows[0]).toMatchObject({
      path: "src/foo.ts",
      status: "modified",
      inclusion: "full",
      reason: "risk: source; source diff within budget"
    });
    expect(routed.sections[0]).toMatchObject({ path: "src/foo.ts", inclusion: "full" });
    expect(routed.markdown).toContain("## Changed Files Manifest");
    expect(routed.markdown).toContain("| src/foo.ts | modified | full | +1/-0 | risk: source; source diff within budget |");
    expect(routed.markdown).toContain("## Context Routing Guidance");
    expect(routed.markdown).toContain(
      "Files marked `omitted` may still contain relevant evidence. Use Read, Grep, Bash, or other available Claude Code tools to inspect partial or omitted files when they matter."
    );
    expect(routed.markdown).toContain("## Routed Git Diff Evidence");
    expect(routed.markdown).toContain("```diff");
    expect(routed.markdown).toContain("+export const added = true;");
  });

  it("includes large source diffs partially with head and tail evidence preserved", () => {
    const middle = Array.from({ length: 80 }, (_, index) => `+middle-${index}`).join("\n");
    const files = parseUnifiedDiff([
      "diff --git a/src/large.ts b/src/large.ts",
      "index 1111111..2222222 100644",
      "--- a/src/large.ts",
      "+++ b/src/large.ts",
      "@@ -1 +1,84 @@",
      "+HEAD-IMPORTANT",
      middle,
      "+TAIL-IMPORTANT"
    ].join("\n"));

    const routed = routeDiffForReview(files, {
      totalBudgetChars: 500,
      fullFileMaxChars: 200
    });

    expect(routed.manifestRows[0]).toMatchObject({
      path: "src/large.ts",
      inclusion: "partial",
      reason: "risk: source; truncated_to_budget"
    });
    expect(routed.markdown).toContain("HEAD-IMPORTANT");
    expect(routed.markdown).toContain("TAIL-IMPORTANT");
    expect(routed.markdown).toContain("[TRUNCATED");
    expect(routed.markdown).not.toContain("middle-40");
  });

  it("omits generated, lockfile, dist, and binary diffs while keeping manifest rows", () => {
    const files = parseUnifiedDiff([
      "diff --git a/package-lock.json b/package-lock.json",
      "index 1111111..2222222 100644",
      "--- a/package-lock.json",
      "+++ b/package-lock.json",
      "@@ -1 +1 @@",
      "-old",
      "+new",
      "diff --git a/dist/app.js b/dist/app.js",
      "index 3333333..4444444 100644",
      "--- a/dist/app.js",
      "+++ b/dist/app.js",
      "@@ -1 +1 @@",
      "-old",
      "+new",
      "diff --git a/assets/logo.png b/assets/logo.png",
      "index 5555555..6666666",
      "Binary files a/assets/logo.png and b/assets/logo.png differ"
    ].join("\n"));

    const routed = routeDiffForReview(files, { totalBudgetChars: 4_000 });

    expect(routed.sections).toHaveLength(0);
    expect(routed.manifestRows.map((row) => [row.path, row.inclusion, row.reason])).toEqual(
      expect.arrayContaining([
        ["package-lock.json", "omitted", "risk: generated_or_lockfile; omitted"],
        ["dist/app.js", "omitted", "risk: generated_or_lockfile; omitted"],
        ["assets/logo.png", "omitted", "risk: binary; omitted"]
      ])
    );
    expect(routed.markdown).toContain("No diff bodies were included in the packet.");
  });

  it("caps very large manifests and reports omitted manifest rows", () => {
    const diff = Array.from({ length: 5 }, (_, index) =>
      [
        `diff --git a/src/file-${index}.ts b/src/file-${index}.ts`,
        "index 1111111..2222222 100644",
        `--- a/src/file-${index}.ts`,
        `+++ b/src/file-${index}.ts`,
        "@@ -1 +1 @@",
        "-old",
        "+new"
      ].join("\n")
    ).join("\n");

    const routed = routeDiffForReview(parseUnifiedDiff(diff), {
      totalBudgetChars: 4_000,
      maxManifestRows: 3
    });

    expect(routed.manifestRows).toHaveLength(5);
    expect(routed.markdown).toContain("| src/file-0.ts | modified | full | +1/-1 | risk: source; source diff within budget |");
    expect(routed.markdown).toContain("| src/file-2.ts | modified | full | +1/-1 | risk: source; source diff within budget |");
    expect(routed.markdown).not.toContain("| src/file-4.ts |");
    expect(routed.markdown).toContain("2 additional changed files omitted from the manifest table");
  });

  it("marks later equal-priority files as budget_exhausted when earlier files consume the body budget", () => {
    const routed = routeDiffForReview(
      [
        diffFile("src/first.ts", "a".repeat(240)),
        diffFile("src/second.ts", "b".repeat(240))
      ],
      {
        totalBudgetChars: 160,
        fullFileMaxChars: 120
      }
    );

    expect(routed.manifestRows.at(-1)).toMatchObject({
      path: "src/second.ts",
      inclusion: "omitted",
      reason: "risk: source; budget_exhausted"
    });
  });

  it("routes high-risk review infrastructure before lower-risk docs consume the body budget", () => {
    const diff = [
      "diff --git a/docs/guide.md b/docs/guide.md",
      "index 1111111..2222222 100644",
      "--- a/docs/guide.md",
      "+++ b/docs/guide.md",
      "@@ -1 +1,60 @@",
      ...Array.from({ length: 60 }, (_, index) => `+doc-${index}`),
      "diff --git a/src/mcp/server.ts b/src/mcp/server.ts",
      "index 3333333..4444444 100644",
      "--- a/src/mcp/server.ts",
      "+++ b/src/mcp/server.ts",
      "@@ -1 +1 @@",
      "-old",
      "+new"
    ].join("\n");

    const routed = routeDiffForReview(parseUnifiedDiff(diff), {
      totalBudgetChars: 260,
      fullFileMaxChars: 260
    });

    expect(routed.sections[0]).toMatchObject({
      path: "src/mcp/server.ts",
      inclusion: "full",
      reason: "risk: mcp_transport; source diff within budget"
    });
    expect(routed.manifestRows.find((row) => row.path === "docs/guide.md")).toMatchObject({
      inclusion: "omitted",
      reason: "risk: docs; budget_exhausted"
    });
  });

  it("lets directory-prefix classifications win over token classifications", () => {
    const routed = routeDiffForReview(
      [
        diffFile("docs/security.md", "d".repeat(90)),
        diffFile("src/runner/auth.ts", "a".repeat(90)),
        diffFile("src/config/permissions.ts", "p".repeat(90))
      ],
      { totalBudgetChars: 1_000 }
    );

    expect(routed.manifestRows.map((row) => [row.path, row.reason])).toEqual([
      ["src/runner/auth.ts", "risk: claude_runner; source diff within budget"],
      ["src/config/permissions.ts", "risk: config_surface; source diff within budget"],
      ["docs/security.md", "risk: security_config; source diff within budget"]
    ]);
  });

  it("keeps original order for equal-priority equal-size source files", () => {
    const routed = routeDiffForReview(
      [
        diffFile("src/bravo.ts", "same-size-body"),
        diffFile("src/alpha.ts", "same-size-body")
      ],
      { totalBudgetChars: 1_000 }
    );

    expect(routed.sections.map((section) => section.path)).toEqual([
      "src/bravo.ts",
      "src/alpha.ts"
    ]);
  });

  it("uses explicit available tools in routing guidance when provided", () => {
    const routed = routeDiffForReview(
      [diffFile("src/profile.ts", "diff body")],
      { totalBudgetChars: 1_000, availableTools: ["Read", "Grep", "Glob"] }
    );

    expect(routed.markdown).toContain(
      "Use the available Claude Code tools (Read, Grep, Glob) to inspect partial or omitted files when they matter."
    );
    expect(routed.markdown).not.toContain("Use Read, Grep, Bash");
  });

  it("uses default routing guidance for the default tools sentinel", () => {
    const routed = routeDiffForReview(
      [diffFile("src/profile.ts", "diff body")],
      { totalBudgetChars: 1_000, availableTools: ["default"] }
    );

    expect(routed.markdown).toContain("Use Read, Grep, Bash, or other available Claude Code tools");
    expect(routed.markdown).not.toContain("Use the available Claude Code tools (default)");
  });
});

describe("routeRawDiffFallbackForReview", () => {
  it("embeds unparseable raw diff evidence using the routed diff markdown shape", () => {
    const routed = routeRawDiffFallbackForReview(
      "mailbox-style diff\n+important fallback evidence\n",
      { totalBudgetChars: 400 }
    );

    expect(routed.manifestRows[0]).toMatchObject({
      path: "[unparsed-diff]",
      status: "unknown",
      inclusion: "full",
      addedLines: 0,
      deletedLines: 0,
      changeSummary: "n/a",
      reason: "risk: unparseable; diff_parse_failed; raw_fallback"
    });
    expect(routed.sections[0]).toMatchObject({
      path: "[unparsed-diff]",
      inclusion: "full",
      reason: "risk: unparseable; diff_parse_failed; raw_fallback"
    });
    expect(routed.markdown).toContain("## Changed Files Manifest");
    expect(routed.markdown).toContain("## Context Routing Guidance");
    expect(routed.markdown).toContain("## Routed Git Diff Evidence");
    expect(routed.markdown).toContain("| [unparsed-diff] | unknown | full | n/a | risk: unparseable; diff_parse_failed; raw_fallback |");
    expect(routed.markdown).toContain("```text");
    expect(routed.markdown).toContain("+important fallback evidence");
  });

  it("marks raw fallback evidence partial when it must be truncated", () => {
    const routed = routeRawDiffFallbackForReview(
      `HEAD-IMPORTANT\n${"middle\n".repeat(80)}TAIL-IMPORTANT\n`,
      { totalBudgetChars: 180 }
    );

    expect(routed.manifestRows[0]).toMatchObject({
      path: "[unparsed-diff]",
      inclusion: "partial",
      reason: "risk: unparseable; diff_parse_failed; raw_fallback"
    });
    expect(routed.sections[0]).toMatchObject({
      path: "[unparsed-diff]",
      inclusion: "partial"
    });
    expect(routed.markdown).toContain("HEAD-IMPORTANT");
    expect(routed.markdown).toContain("TAIL-IMPORTANT");
    expect(routed.markdown).toContain("[TRUNCATED");
  });
});

function diffFile(path: string, rawBody: string): ParsedDiffFile {
  return {
    path,
    status: "modified",
    addedLines: 1,
    deletedLines: 1,
    binary: false,
    generated: false,
    raw: rawBody
  };
}
