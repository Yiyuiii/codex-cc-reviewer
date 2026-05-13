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
  maxTurns: 8,
  includeGitDiff: false,
  includeGitStatus: false,
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
    expect(packet).toContain("## Codex Goal\n\nFocus on regression risk.");
    expect(packet).toContain("## Current Context\n\nPlease review the diff for correctness.");
    expect(packet).toContain("## Review Instructions");
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
        getGitStatus: async () => "M src/index.ts",
        getGitDiff: async () => "diff --git a/src/index.ts b/src/index.ts"
      }
    );

    expect(packet).toContain("## Optional Git Status");
    expect(packet).toContain("M src/index.ts");
    expect(packet).toContain("## Optional Git Diff");
    expect(packet).toContain("diff --git a/src/index.ts b/src/index.ts");
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

    expect(packet.length).toBeLessThan(2_000);
    expect(packet).toContain("[TRUNCATED");
  });

  it("applies the context limit to the whole packet budget, not each block independently", async () => {
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
        getGitStatus: async () => "s".repeat(2_000),
        getGitDiff: async () => "d".repeat(2_000)
      }
    );

    expect(packet.length).toBeLessThan(3_000);
    expect(packet).toContain("[TRUNCATED");
  });
});
