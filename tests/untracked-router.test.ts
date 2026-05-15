import { describe, expect, it } from "vitest";

import type { UntrackedFileEvidence } from "../src/git/untracked.js";
import { routeUntrackedForReview } from "../src/review/untracked-router.js";

describe("routeUntrackedForReview", () => {
  it("embeds selected untracked text files and keeps a separate manifest", () => {
    const routed = routeUntrackedForReview(
      [
        candidate(".env", "DATABASE_URL=postgres://user:pwd@localhost/app\n"),
        { path: "dist/app.js", sizeBytes: 12, inclusion: "omitted", reason: "generated_or_lockfile" }
      ],
      { totalBudgetChars: 4_000, contentRedacted: false }
    );

    expect(routed.manifestRows).toEqual([
      expect.objectContaining({
        path: ".env",
        inclusion: "full",
        reason: "untracked_text; embedded raw because redactSecrets=false",
        redacted: false
      }),
      expect.objectContaining({
        path: "dist/app.js",
        inclusion: "omitted",
        reason: "generated_or_lockfile"
      })
    ]);
    expect(routed.markdown).toContain("## Untracked Files Manifest");
    expect(routed.markdown).toContain("| .env | full |");
    expect(routed.markdown).toContain("## Routed Untracked File Evidence");
    expect(routed.markdown).toContain(
      "Files marked `omitted` may still contain relevant evidence. Use Read, Grep, Bash, or other available Claude Code tools to inspect them when they matter."
    );
    expect(routed.markdown).toContain("### .env");
    expect(routed.markdown).toContain("DATABASE_URL=postgres://user:pwd@localhost/app");
  });

  it("marks redacted embedded content transparently", () => {
    const routed = routeUntrackedForReview(
      [candidate(".env", "DATABASE_URL=[REDACTED]\n")],
      { totalBudgetChars: 4_000, contentRedacted: true }
    );

    expect(routed.manifestRows[0]).toMatchObject({
      path: ".env",
      inclusion: "full",
      reason: "untracked_text; embedded with redactSecrets=true",
      redacted: true
    });
  });

  it("truncates oversized untracked text within the embedded file budget", () => {
    const routed = routeUntrackedForReview(
      [candidate("src/new-feature.ts", `HEAD\n${"middle\n".repeat(80)}TAIL\n`)],
      { totalBudgetChars: 500, fullFileMaxChars: 160, contentRedacted: false }
    );

    expect(routed.manifestRows[0]).toMatchObject({
      path: "src/new-feature.ts",
      inclusion: "partial",
      reason: "untracked_text; truncated_to_budget; embedded raw because redactSecrets=false"
    });
    expect(routed.markdown).toContain("HEAD");
    expect(routed.markdown).toContain("TAIL");
    expect(routed.markdown).toContain("[TRUNCATED");
  });

  it("routes higher-risk untracked source before lower-risk docs consume the body budget", () => {
    const routed = routeUntrackedForReview(
      [
        candidate("docs/notes.md", "docs\n".repeat(80)),
        candidate("src/new-feature.ts", "export const value = 1;\n")
      ],
      { totalBudgetChars: 140, fullFileMaxChars: 140, contentRedacted: false }
    );

    expect(routed.sections[0]).toMatchObject({
      path: "src/new-feature.ts",
      inclusion: "full"
    });
    expect(routed.manifestRows.find((row) => row.path === "docs/notes.md")).toMatchObject({
      inclusion: "omitted",
      reason: "untracked_text; budget_exhausted"
    });
  });

  it("uses a longer markdown fence when untracked content contains triple backticks", () => {
    const routed = routeUntrackedForReview(
      [candidate("notes.md", "before\n```\nafter\n")],
      { totalBudgetChars: 4_000, contentRedacted: false }
    );

    expect(routed.markdown).toContain("````text\nbefore\n```\nafter\n\n````");
  });

  it("uses explicit available tools in routing guidance when provided", () => {
    const routed = routeUntrackedForReview(
      [candidate("src/new-feature.ts", "export const value = 1;\n")],
      {
        totalBudgetChars: 4_000,
        contentRedacted: false,
        availableTools: ["Read", "Grep", "Glob"]
      }
    );

    expect(routed.markdown).toContain(
      "Use the available Claude Code tools (Read, Grep, Glob) to inspect them when they matter."
    );
    expect(routed.markdown).not.toContain("Use Read, Grep, Bash");
  });

  it("uses default routing guidance for the default tools sentinel", () => {
    const routed = routeUntrackedForReview(
      [candidate("src/new-feature.ts", "export const value = 1;\n")],
      {
        totalBudgetChars: 4_000,
        contentRedacted: false,
        availableTools: ["default"]
      }
    );

    expect(routed.markdown).toContain("Use Read, Grep, Bash, or other available Claude Code tools");
    expect(routed.markdown).not.toContain("Use the available Claude Code tools (default)");
  });
});

function candidate(path: string, content: string): UntrackedFileEvidence {
  return {
    path,
    sizeBytes: Buffer.byteLength(content, "utf8"),
    content,
    inclusion: "candidate",
    reason: "untracked_text"
  };
}
