import { describe, expect, it } from "vitest";

import { runClaudeReview, type ClaudeExecutor } from "../src/runner/claude.js";
import type { CcReviewInput } from "../src/review/schema.js";

const baseInput: CcReviewInput = {
  task: "review_plan",
  context: "Review this plan.",
  model: "sonnet",
  effort: "high",
  output: "markdown",
  permissionMode: "plan",
  tools: ["Read"],
  maxTurns: 8,
  includeGitDiff: false,
  includeGitStatus: false,
  redactSecrets: true,
  maxContextChars: 120_000
};

describe("runClaudeReview", () => {
  it("runs Claude with safe defaults and sends the packet through stdin", async () => {
    let observed: Parameters<ClaudeExecutor> | undefined;
    const execute: ClaudeExecutor = async (...args) => {
      observed = args;
      return {
        stdout: JSON.stringify({ result: "No findings." }),
        stderr: "",
        exitCode: 0
      };
    };

    const result = await runClaudeReview(baseInput, {
      execute,
      now: fakeClock([1_000, 1_250]),
      buildPacket: async () => "PACKET"
    });

    expect(result.ok).toBe(true);
    expect(result.elapsedMs).toBe(250);
    expect(result.review).toBe("No findings.");
    expect(observed?.[0]).toBe("claude");
    expect(observed?.[1]).toEqual([
      "-p",
      "Review the packet provided on stdin.",
      "--model",
      "sonnet",
      "--effort",
      "high",
      "--permission-mode",
      "plan",
      "--tools",
      "Read",
      "--output-format",
      "json",
      "--max-turns",
      "8",
      "--no-session-persistence"
    ]);
    expect(observed?.[2].input).toBe("PACKET");
    expect(observed?.[2].reject).toBe(false);
  });

  it("extracts structured output when Claude returns JSON schema output", async () => {
    const execute: ClaudeExecutor = async () => ({
      stdout: JSON.stringify({
        result: "Needs changes.",
        structured_output: { verdict: "needs_changes", findings: [] }
      }),
      stderr: "",
      exitCode: 0
    });

    const result = await runClaudeReview(
      {
        ...baseInput,
        output: "json"
      },
      {
        execute,
        now: fakeClock([1, 2]),
        buildPacket: async () => "PACKET"
      }
    );

    expect(result.review).toBe("Needs changes.");
    expect(result.structured).toEqual({ verdict: "needs_changes", findings: [] });
  });

  it("returns stderr tail and exit code when Claude fails", async () => {
    const execute: ClaudeExecutor = async () => ({
      stdout: "partial stdout",
      stderr: `${"x".repeat(4_100)}tail`,
      exitCode: 2
    });

    const result = await runClaudeReview(baseInput, {
      execute,
      now: fakeClock([10, 30]),
      buildPacket: async () => "PACKET"
    });

    expect(result.ok).toBe(false);
    expect(result.review).toBe("partial stdout");
    expect(result.exitCode).toBe(2);
    expect(result.stderrTail).toHaveLength(4_000);
    expect(result.stderrTail?.endsWith("tail")).toBe(true);
  });
});

function fakeClock(values: number[]): () => number {
  let index = 0;
  return () => values[index++] ?? values.at(-1) ?? 0;
}
