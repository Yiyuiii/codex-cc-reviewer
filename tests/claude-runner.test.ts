import { describe, expect, it } from "vitest";

import { runClaudeReview, type ClaudeExecutor } from "../src/runner/claude.js";
import type { CcReviewInput } from "../src/review/schema.js";

const baseInput: CcReviewInput = {
  task: "review_plan",
  context: "Review this plan.",
  model: "opus",
  effort: "max",
  output: "markdown",
  permissionMode: "bypassPermissions",
  tools: ["default"],
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

describe("runClaudeReview", () => {
  it("runs Claude with deep autonomous streaming defaults and sends the packet through stdin", async () => {
    let observed: Parameters<ClaudeExecutor> | undefined;
    const execute: ClaudeExecutor = async (...args) => {
      observed = args;
      return {
        stdout: [
          JSON.stringify({ type: "system", subtype: "init", session_id: "abc" }),
          JSON.stringify({
            type: "stream_event",
            event: {
              type: "content_block_delta",
              delta: { type: "text_delta", text: "I will inspect " }
            }
          }),
          JSON.stringify({
            type: "stream_event",
            event: {
              type: "content_block_delta",
              delta: { type: "text_delta", text: "the package." }
            }
          }),
          JSON.stringify({
            type: "assistant",
            message: {
              content: [
                { type: "text", text: "Intermediate finding." },
                { type: "tool_use", name: "Read", input: { file_path: "README.md" } }
              ]
            }
          }),
          JSON.stringify({
            type: "result",
            result: "No findings.",
            total_cost_usd: 0.12,
            usage: {
              cache_creation_input_tokens: 1000,
              cache_read_input_tokens: 2000
            }
          })
        ].join("\n"),
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
    expect(result.eventsTail).toEqual([
      "system:init",
      "text_delta",
      "text_delta",
      "tool_use: Read {\"file_path\":\"README.md\"}",
      "result"
    ]);
    expect(result.transcriptTail).toEqual([
      "I will inspect the package.",
      "Intermediate finding."
    ]);
    expect(result.eventCount).toBe(5);
    expect(result.cache).toEqual({
      creationInputTokens: 1000,
      readInputTokens: 2000
    });
    expect(result.costUsd).toBe(0.12);
    expect(observed?.[0]).toBe("claude");
    expect(observed?.[1]).toEqual([
      "-p",
      "Review the packet provided on stdin.",
      "--model",
      "opus",
      "--effort",
      "max",
      "--permission-mode",
      "bypassPermissions",
      "--dangerously-skip-permissions",
      "--tools",
      "default",
      "--output-format",
      "stream-json",
      "--verbose",
      "--include-partial-messages",
      "--include-hook-events",
      "--max-turns",
      "8",
      "--no-session-persistence"
    ]);
    expect(observed?.[2].input).toBe("PACKET");
    expect(observed?.[2].reject).toBe(false);
    expect(observed?.[2].env?.ENABLE_PROMPT_CACHING_1H).toBe("1");
  });

  it("overrides inherited 1h cache env when cacheTtl is 5m", async () => {
    let observed: Parameters<ClaudeExecutor> | undefined;
    const execute: ClaudeExecutor = async (...args) => {
      observed = args;
      return {
        stdout: JSON.stringify({ result: "No findings." }),
        stderr: "",
        exitCode: 0
      };
    };

    await runClaudeReview(
      {
        ...baseInput,
        stream: false,
        cacheTtl: "5m"
      },
      {
        execute,
        now: fakeClock([1, 2]),
        buildPacket: async () => "PACKET"
      }
    );

    expect(observed?.[2].env?.ENABLE_PROMPT_CACHING_1H).toBe("0");
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
        output: "json",
        stream: false
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
