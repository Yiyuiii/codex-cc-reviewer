import { describe, expect, it } from "vitest";

import { buildReviewPacket } from "../src/review/packet.js";
import type { CcReviewInput } from "../src/review/schema.js";

const baseInput: CcReviewInput = {
  task: "review_diff",
  context: "Please review the diff for correctness.",
  model: "sonnet",
  effort: "high",
  output: "markdown",
  permissionMode: "plan",
  tools: ["Read"],
  includeGitDiff: false,
  includeGitStatus: false,
  autoDiscoverGit: false,
  redactSecrets: true,
  maxContextChars: 120_000,
  stream: true,
  includePartialMessages: true,
  includeHookEvents: true,
  verbose: true,
  cacheTtl: "1h"
};

describe("buildReviewPacket", () => {
  it("wraps review input in stable packet sections", async () => {
    const packet = await buildReviewPacket({
      ...baseInput,
      prompt: "Focus on regression risk."
    });

    expect(packet).toContain("# Codex to Claude Code Review Packet");
    expect(packet).toContain("## Task Type\n\nreview_diff");
    expect(packet).toContain("## Review Focus\n\nFocus on regression risk.");
    expect(packet).not.toContain("## Codex Goal");
    expect(packet).toContain("## Current Context\n\nPlease review the diff for correctness.");
    expect(packet).toContain("## Review Instructions");
  });

  it("separates original goal, review focus, implementation notes, risks, and tests", async () => {
    const packet = await buildReviewPacket({
      ...baseInput,
      originalGoal: "Ship a safe installer.",
      reviewFocus: "Focus on install rollback.",
      codexSummary: "Changed the Codex config writer.",
      acceptanceCriteria: ["Install is idempotent.", "Uninstall removes only this server."],
      knownRisks: ["Windows TOML formatting."],
      testsRun: ["npm test: passed"]
    });

    expect(packet).toContain("## Original User Goal\n\nShip a safe installer.");
    expect(packet).toContain("## Acceptance Criteria\n\n- Install is idempotent.\n- Uninstall removes only this server.");
    expect(packet).toContain("## Codex Implementation Summary\n\nChanged the Codex config writer.");
    expect(packet).toContain("## Known Risks\n\n- Windows TOML formatting.");
    expect(packet).toContain("## Tests Run\n\n- npm test: passed");
    expect(packet).toContain("## Review Focus\n\nFocus on install rollback.");
  });

  it("puts stable review instructions before variable context for better cache reuse", async () => {
    const packet = await buildReviewPacket({
      ...baseInput,
      context: "volatile context"
    });

    expect(packet.indexOf("## Review Instructions")).toBeLessThan(
      packet.indexOf("## Current Context")
    );
  });

  it("injects git status and diff only when requested", async () => {
    const packet = await buildReviewPacket(
      {
        ...baseInput,
        includeGitStatus: true,
        includeGitDiff: true
      },
      {
        getGitSummary: async () => "Summary",
        getGitStatus: async () => "M src/index.ts",
        getGitDiff: async () => "diff --git a/src/index.ts b/src/index.ts"
      }
    );

    expect(packet).toContain("## Git Evidence Summary");
    expect(packet).toContain("Summary");
    expect(packet).toContain("## Optional Git Status");
    expect(packet).toContain("M src/index.ts");
    expect(packet).toContain("## Changed Files Manifest");
    expect(packet).toContain("## Routed Git Diff Evidence");
    expect(packet).toContain("diff --git a/src/index.ts b/src/index.ts");
  });

  it("routes git diff evidence through manifest, guidance, and per-file sections", async () => {
    const packet = await buildReviewPacket(
      {
        ...baseInput,
        includeGitDiff: true
      },
      {
        getGitSummary: async () => "Summary",
        getGitDiff: async () => [
          "diff --git a/src/foo.ts b/src/foo.ts",
          "index 1111111..2222222 100644",
          "--- a/src/foo.ts",
          "+++ b/src/foo.ts",
          "@@ -1 +1,2 @@",
          " const keep = true;",
          "+export const added = true;",
          "diff --git a/package-lock.json b/package-lock.json",
          "index 3333333..4444444 100644",
          "--- a/package-lock.json",
          "+++ b/package-lock.json",
          "@@ -1 +1 @@",
          "-old",
          "+new"
        ].join("\n")
      }
    );

    expect(packet).toContain("## Changed Files Manifest");
    expect(packet).toContain("| src/foo.ts | modified | full | +1/-0 | source diff within budget |");
    expect(packet).toContain("| package-lock.json | modified | omitted | +1/-1 | generated_or_lockfile |");
    expect(packet).toContain("## Context Routing Guidance");
    expect(packet).toContain("partial or omitted");
    expect(packet).toContain("## Routed Git Diff Evidence");
    expect(packet).toContain("### src/foo.ts");
    expect(packet).toContain("+export const added = true;");
    expect(packet).not.toContain("```diff\n-old\n+new");
  });

  it("auto-discovers git evidence for review_diff by default", async () => {
    const packet = await buildReviewPacket(
      {
        ...baseInput,
        autoDiscoverGit: undefined
      },
      {
        getGitSummary: async () => "Diff Stat\n src/index.ts | 2 +-\nName Status\nM\tsrc/index.ts",
        getGitStatus: async () => "1 .M N... 100644 100644 100644 abc abc src/index.ts",
        getGitDiff: async () => "diff --git a/src/index.ts b/src/index.ts"
      }
    );

    expect(packet).toContain("## Git Evidence Summary");
    expect(packet).toContain("Name Status");
    expect(packet).toContain("## Optional Git Status");
    expect(packet).toContain("1 .M N...");
    expect(packet).toContain("## Changed Files Manifest");
    expect(packet).toContain("diff --git a/src/index.ts b/src/index.ts");
  });

  it("auto-discovers lightweight git summary for review_plan by default", async () => {
    const called: string[] = [];

    const packet = await buildReviewPacket(
      {
        ...baseInput,
        task: "review_plan",
        autoDiscoverGit: undefined
      },
      {
        getGitSummary: async () => {
          called.push("summary");
          return "Diff Stat\n src/index.ts | 2 +-\nName Status\nM\tsrc/index.ts";
        },
        getGitStatus: async () => {
          called.push("status");
          return "status";
        },
        getGitDiff: async () => {
          called.push("diff");
          return "diff";
        }
      }
    );

    expect(called).toEqual(["summary"]);
    expect(packet).toContain("## Git Evidence Summary");
    expect(packet).toContain("Name Status");
    expect(packet).not.toContain("## Optional Git Status");
    expect(packet).not.toContain("## Optional Git Diff");
  });

  it("auto-discovers raw git evidence for review_plan when explicitly requested", async () => {
    const called: string[] = [];

    const packet = await buildReviewPacket(
      {
        ...baseInput,
        task: "review_plan",
        autoDiscoverGit: true
      },
      {
        getGitSummary: async () => {
          called.push("summary");
          return "Diff Stat\n src/index.ts | 2 +-\nName Status\nM\tsrc/index.ts";
        },
        getGitStatus: async () => {
          called.push("status");
          return "1 .M N... 100644 100644 100644 abc abc src/index.ts";
        },
        getGitDiff: async () => {
          called.push("diff");
          return "diff --git a/src/index.ts b/src/index.ts";
        }
      }
    );

    expect(called).toEqual(["summary", "status", "diff"]);
    expect(packet).toContain("## Git Evidence Summary");
    expect(packet).toContain("## Optional Git Status");
    expect(packet).toContain("## Changed Files Manifest");
  });

  it("does not auto-discover git evidence when autoDiscoverGit is false", async () => {
    let gitCalls = 0;

    const packet = await buildReviewPacket(
      {
        ...baseInput,
        task: "review_plan",
        autoDiscoverGit: false
      },
      {
        getGitSummary: async () => {
          gitCalls += 1;
          return "summary";
        },
        getGitStatus: async () => {
          gitCalls += 1;
          return "status";
        },
        getGitDiff: async () => {
          gitCalls += 1;
          return "diff";
        }
      }
    );

    expect(gitCalls).toBe(0);
    expect(packet).not.toContain("## Git Evidence Summary");
    expect(packet).not.toContain("## Optional Git Status");
    expect(packet).not.toContain("## Optional Git Diff");
  });

  it("prefers reviewFocus over the backward-compatible prompt alias", async () => {
    const packet = await buildReviewPacket({
      ...baseInput,
      prompt: "Legacy focus.",
      reviewFocus: "New focus."
    });

    expect(packet).toContain("## Review Focus\n\nNew focus.");
    expect(packet).not.toContain("Legacy focus.");
  });

  it("adds diagnostics when review_diff discovers no git evidence", async () => {
    const packet = await buildReviewPacket(
      {
        ...baseInput,
        autoDiscoverGit: undefined
      },
      {
        getGitSummary: async () => "",
        getGitStatus: async () => "",
        getGitDiff: async () => ""
      }
    );

    expect(packet).toContain("## Packet Diagnostics");
    expect(packet).toContain("review_diff requested git evidence, but no git status or diff was provided or discovered.");
    expect(packet).not.toContain("## Optional Git Status");
    expect(packet).not.toContain("## Optional Git Diff");
  });

  it("redacts common secret-shaped values", async () => {
    const packet = await buildReviewPacket({
      ...baseInput,
      context: "The code uses API_KEY=sk-test1234567890 and password=\"open sesame\"."
    });

    expect(packet).not.toContain("sk-test1234567890");
    expect(packet).not.toContain("open sesame");
    expect(packet).toContain("[REDACTED]");
  });

  it("limits oversized context and marks truncation", async () => {
    const packet = await buildReviewPacket({
      ...baseInput,
      context: "x".repeat(5_000),
      maxContextChars: 1_000
    });

    expect(packet.length).toBeLessThan(3_500);
    expect(packet).toContain("[TRUNCATED");
  });

  it("truncates oversized packet blocks from the middle and keeps both ends", async () => {
    const packet = await buildReviewPacket({
      ...baseInput,
      context: `HEAD-IMPORTANT\n${"a".repeat(700)}\nMIDDLE-SHOULD-BE-OMITTED\n${"b".repeat(700)}\nTAIL-IMPORTANT`,
      maxContextChars: 1_000
    });

    expect(packet).toContain("HEAD-IMPORTANT");
    expect(packet).toContain("TAIL-IMPORTANT");
    expect(packet).toContain("[TRUNCATED");
    expect(packet).toContain("from middle");
    expect(packet).not.toContain("MIDDLE-SHOULD-BE-OMITTED");
  });

  it("applies the context limit to variable packet blocks, not each block independently", async () => {
    const packet = await buildReviewPacket(
      {
        ...baseInput,
        prompt: "p".repeat(2_000),
        context: "c".repeat(2_000),
        includeGitStatus: true,
        includeGitDiff: true,
        maxContextChars: 1_500
      },
      {
        getGitSummary: async () => "g".repeat(2_000),
        getGitStatus: async () => "s".repeat(2_000),
        getGitDiff: async () => "d".repeat(2_000)
      }
    );

    expect(packet.length).toBeLessThan(4_500);
    expect(packet).toContain("[TRUNCATED");
  });
});
