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
        inputTokens: 10,
        creationInputTokens: 1000,
        readInputTokens: 2000,
        cacheCreation: {
          ephemeral1hInputTokens: 750,
          ephemeral5mInputTokens: 250
        },
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
    expect(formatted).toContain("input tokens (uncached): 10");
    expect(formatted).toContain("cache creation tokens: 1000");
    expect(formatted).toContain("cache creation 1h tokens: 750");
    expect(formatted).toContain("cache creation 5m tokens: 250");
    expect(formatted).toContain("cache read tokens: 2000");
    expect(formatted).toContain("## Diagnostics");
    expect(formatted).toContain("progressToken");
    expect(formatted).toContain("cost: $0.12");
  });

  it("prints cache input tokens when they are the only reported cache detail", () => {
    const output: CcReviewOutput = {
      ok: true,
      task: "review_doc",
      model: "opus",
      elapsedMs: 100,
      review: "Main review.",
      command: ["claude"],
      cache: {
        inputTokens: 7
      }
    };

    const formatted = formatReviewResult(output);

    expect(formatted).toContain("input tokens (uncached): 7");
    expect(formatted).not.toContain("cache read tokens");
    expect(formatted).not.toContain("cache creation tokens");
  });
});
