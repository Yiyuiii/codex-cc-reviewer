import { describe, expect, it } from "vitest";

import { routeDiffForReview } from "../src/review/context-router.js";
import { parseUnifiedDiff } from "../src/review/diff-parser.js";

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
      reason: "source diff within budget"
    });
    expect(routed.sections[0]).toMatchObject({ path: "src/foo.ts", inclusion: "full" });
    expect(routed.markdown).toContain("## Changed Files Manifest");
    expect(routed.markdown).toContain("| src/foo.ts | modified | full | +1/-0 | source diff within budget |");
    expect(routed.markdown).toContain("## Context Routing Guidance");
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
      reason: "truncated_to_budget"
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
    expect(routed.manifestRows.map((row) => [row.path, row.inclusion, row.reason])).toEqual([
      ["package-lock.json", "omitted", "generated_or_lockfile"],
      ["dist/app.js", "omitted", "generated_or_lockfile"],
      ["assets/logo.png", "omitted", "binary"]
    ]);
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
    expect(routed.markdown).toContain("| src/file-0.ts | modified | full | +1/-1 | source diff within budget |");
    expect(routed.markdown).toContain("| src/file-2.ts | modified | full | +1/-1 | source diff within budget |");
    expect(routed.markdown).not.toContain("| src/file-4.ts |");
    expect(routed.markdown).toContain("2 additional changed files omitted from the manifest table");
  });

  it("marks later source files as budget_exhausted when earlier files consume the diff body budget", () => {
    const diff = [
      "diff --git a/src/first.ts b/src/first.ts",
      "index 1111111..2222222 100644",
      "--- a/src/first.ts",
      "+++ b/src/first.ts",
      "@@ -1 +1,30 @@",
      ...Array.from({ length: 30 }, (_, index) => `+first-${index}`),
      "diff --git a/src/second.ts b/src/second.ts",
      "index 3333333..4444444 100644",
      "--- a/src/second.ts",
      "+++ b/src/second.ts",
      "@@ -1 +1 @@",
      "-old",
      "+new"
    ].join("\n");

    const routed = routeDiffForReview(parseUnifiedDiff(diff), {
      totalBudgetChars: 160,
      fullFileMaxChars: 120
    });

    expect(routed.manifestRows.at(-1)).toMatchObject({
      path: "src/second.ts",
      inclusion: "omitted",
      reason: "budget_exhausted"
    });
  });
});
