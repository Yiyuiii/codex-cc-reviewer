import { describe, expect, it } from "vitest";

import { formatReviewResult } from "../src/review/format.js";
import type { CcReviewOutput } from "../src/review/schema.js";

describe("formatReviewResult", () => {
  it("includes Claude Code activity and cache usage after the review", () => {
    const output: CcReviewOutput = {
      ok: true,
      task: "review_plan",
      model: "opus",
      elapsedMs: 100,
      review: "Main review.",
      command: ["claude"],
      eventsTail: ["system:init", "tool_use: Read {\"file_path\":\"README.md\"}", "result"],
      transcriptTail: ["I will inspect the package.", "Intermediate finding."],
      activityTail: [
        {
          index: 1,
          kind: "tool_use",
          rawType: "assistant.tool_use",
          summary: "tool_use: Read {\"file_path\":\"README.md\"}",
          toolName: "Read",
          toolInput: { file_path: "README.md" }
        }
      ],
      eventCount: 3,
      cache: {
        creationInputTokens: 1000,
        readInputTokens: 2000,
        effective: "hit"
      },
      costUsd: 0.12,
      diagnostics: ["MCP client did not provide progressToken; real-time progress unavailable."]
    };

    const formatted = formatReviewResult(output);

    expect(formatted).toContain("Main review.");
    expect(formatted).toContain("## Claude Code Activity");
    expect(formatted).toContain("- tool_use: Read");
    expect(formatted).toContain("## Claude Code Transcript");
    expect(formatted).toContain("I will inspect the package.");
    expect(formatted).toContain("## Claude Code Timeline");
    expect(formatted).toContain("assistant.tool_use");
    expect(formatted).toContain("cache effective: hit");
    expect(formatted).toContain("cache read tokens: 2000");
    expect(formatted).toContain("## Diagnostics");
    expect(formatted).toContain("progressToken");
    expect(formatted).toContain("cost: $0.12");
  });
});
