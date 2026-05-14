import { describe, expect, it } from "vitest";

import { isGeneratedOrLockfilePath, parseUnifiedDiff } from "../src/review/diff-parser.js";

describe("parseUnifiedDiff", () => {
  it("returns no files for an empty diff", () => {
    expect(parseUnifiedDiff("")).toEqual([]);
  });

  it("parses modified, added, deleted, renamed, and binary file blocks", () => {
    const files = parseUnifiedDiff([
      "diff --git a/src/foo.ts b/src/foo.ts",
      "index 1111111..2222222 100644",
      "--- a/src/foo.ts",
      "+++ b/src/foo.ts",
      "@@ -1,2 +1,3 @@",
      " const keep = true;",
      "-const oldValue = 1;",
      "+const newValue = 2;",
      "+const added = 3;",
      "diff --git a/src/new.ts b/src/new.ts",
      "new file mode 100644",
      "index 0000000..3333333",
      "--- /dev/null",
      "+++ b/src/new.ts",
      "@@ -0,0 +1 @@",
      "+export const value = 1;",
      "diff --git a/src/old.ts b/src/old.ts",
      "deleted file mode 100644",
      "index 4444444..0000000",
      "--- a/src/old.ts",
      "+++ /dev/null",
      "@@ -1 +0,0 @@",
      "-export const removed = true;",
      "diff --git a/src/old-name.ts b/src/new-name.ts",
      "similarity index 78%",
      "rename from src/old-name.ts",
      "rename to src/new-name.ts",
      "index 5555555..6666666 100644",
      "--- a/src/old-name.ts",
      "+++ b/src/new-name.ts",
      "@@ -1 +1 @@",
      "-export const name = 'old';",
      "+export const name = 'new';",
      "diff --git a/assets/logo.png b/assets/logo.png",
      "new file mode 100644",
      "index 0000000..7777777",
      "Binary files /dev/null and b/assets/logo.png differ"
    ].join("\n"));

    expect(files.map((file) => [file.path, file.status, file.addedLines, file.deletedLines])).toEqual([
      ["src/foo.ts", "modified", 2, 1],
      ["src/new.ts", "added", 1, 0],
      ["src/old.ts", "deleted", 0, 1],
      ["src/new-name.ts", "renamed", 1, 1],
      ["assets/logo.png", "binary", 0, 0]
    ]);
    expect(files[3]?.oldPath).toBe("src/old-name.ts");
    expect(files[4]?.binary).toBe(true);
  });

  it("ignores no-newline markers when counting changed lines", () => {
    const files = parseUnifiedDiff([
      "diff --git a/src/no-newline.ts b/src/no-newline.ts",
      "index 1111111..2222222 100644",
      "--- a/src/no-newline.ts",
      "+++ b/src/no-newline.ts",
      "@@ -1 +1 @@",
      "-old",
      "\\ No newline at end of file",
      "+new",
      "\\ No newline at end of file"
    ].join("\n"));

    expect(files[0]?.addedLines).toBe(1);
    expect(files[0]?.deletedLines).toBe(1);
  });

  it("counts content lines that start with plus-plus or dash-dash", () => {
    const files = parseUnifiedDiff([
      "diff --git a/src/operators.ts b/src/operators.ts",
      "index 1111111..2222222 100644",
      "--- a/src/operators.ts",
      "+++ b/src/operators.ts",
      "@@ -1 +1 @@",
      "---old-content",
      "+++new-content"
    ].join("\n"));

    expect(files[0]?.addedLines).toBe(1);
    expect(files[0]?.deletedLines).toBe(1);
  });

  it("parses copied files, git binary patches, CRLF diffs, and generated lockfiles", () => {
    const files = parseUnifiedDiff([
      "diff --git a/src/source.ts b/src/copy.ts\r\n",
      "similarity index 100%\r\n",
      "copy from src/source.ts\r\n",
      "copy to src/copy.ts\r\n",
      "diff --git a/assets/image.bin b/assets/image.bin\r\n",
      "new file mode 100644\r\n",
      "index 0000000..1111111\r\n",
      "GIT binary patch\r\n",
      "literal 0\r\n",
      "diff --git a/npm-shrinkwrap.json b/npm-shrinkwrap.json\r\n",
      "index 2222222..3333333 100644\r\n",
      "--- a/npm-shrinkwrap.json\r\n",
      "+++ b/npm-shrinkwrap.json\r\n",
      "@@ -1 +1 @@\r\n",
      "-old\r\n",
      "+new\r\n"
    ].join(""));

    expect(files[0]).toMatchObject({
      path: "src/copy.ts",
      oldPath: "src/source.ts",
      status: "copied"
    });
    expect(files[1]).toMatchObject({
      path: "assets/image.bin",
      status: "binary",
      binary: true
    });
    expect(files[2]).toMatchObject({
      path: "npm-shrinkwrap.json",
      generated: true
    });
  });

  it("does not classify source cache directories as generated output", () => {
    expect(isGeneratedOrLockfilePath("src/cache/session.ts")).toBe(false);
    expect(isGeneratedOrLockfilePath("src/foo/cache/session.ts")).toBe(false);
    expect(isGeneratedOrLockfilePath("cache/session.json")).toBe(true);
    expect(isGeneratedOrLockfilePath(".cache/session.json")).toBe(true);
  });
});
