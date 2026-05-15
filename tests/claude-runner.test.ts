import { describe, expect, it } from "vitest";

import {
  buildExecaOptions,
  runClaudeReview,
  type ClaudeExecutor,
  type StreamingClaudeExecutor
} from "../src/runner/claude.js";
import type { CcReviewInput } from "../src/review/schema.js";

const baseInput: CcReviewInput = {
  task: "review_plan",
  context: "Review this plan.",
  model: "opus",
  effort: "max",
  output: "markdown",
  permissionMode: "bypassPermissions",
  tools: ["default"],
  includeGitDiff: false,
  includeGitStatus: false,
  includeUntrackedContent: undefined,
  redactSecrets: true,
  maxContextChars: 120_000,
  stream: true,
  includePartialMessages: true,
  includeHookEvents: true,
  verbose: true,
  cacheTtl: "1h"
};

describe("runClaudeReview", () => {
  it("maps internal AbortSignal to execa cancelSignal without leaking signal", () => {
    const controller = new AbortController();

    const options = buildExecaOptions({
      cwd: process.cwd(),
      input: "PACKET",
      env: { ENABLE_PROMPT_CACHING_1H: "1" },
      reject: false,
      timeout: 1000,
      signal: controller.signal
    });

    expect(options).not.toHaveProperty("signal");
    expect(options).toHaveProperty("cancelSignal", controller.signal);
  });

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
              input_tokens: 12,
              cache_creation_input_tokens: 1000,
              cache_read_input_tokens: 2000,
              cache_creation: {
                ephemeral_1h_input_tokens: 750,
                ephemeral_5m_input_tokens: 250
              }
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
      inputTokens: 12,
      creationInputTokens: 1000,
      readInputTokens: 2000,
      cacheCreation: {
        ephemeral1hInputTokens: 750,
        ephemeral5mInputTokens: 250
      },
      effective: "hit"
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
      "--no-session-persistence"
    ]);
    expect(observed?.[1]).not.toContain("--max-turns");
    expect(observed?.[1]).not.toContain("--max-budget-usd");
    expect(observed?.[2].input).toBe("PACKET");
    expect(observed?.[2].reject).toBe(false);
    expect(observed?.[2].env?.ENABLE_PROMPT_CACHING_1H).toBe("1");
  });

  it("overrides inherited 1h cache env when cacheTtl is 5m", async () => {
    let observed: Parameters<ClaudeExecutor> | undefined;
    const execute: ClaudeExecutor = async (...args) => {
      observed = args;
      return {
        stdout: JSON.stringify({
          result: "No findings.",
          usage: {
            input_tokens: 3,
            cache_creation: {
              ephemeral_1h_input_tokens: 17,
              ephemeral_5m_input_tokens: 19
            }
          }
        }),
        stderr: "",
        exitCode: 0
      };
    };

    const result = await runClaudeReview(
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
    expect(result.cache).toEqual({
      inputTokens: 3,
      cacheCreation: {
        ephemeral1hInputTokens: 17,
        ephemeral5mInputTokens: 19
      },
      effective: "disabled"
    });
  });

  it("extracts structured output when Claude returns JSON schema output", async () => {
    const execute: ClaudeExecutor = async () => ({
      stdout: JSON.stringify({
        result: "Needs changes.",
        structured_output: { verdict: "needs_changes", findings: [] },
        usage: {
          input_tokens: 5,
          cache_creation: {
            ephemeral_5m_input_tokens: 21
          }
        }
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
    expect(result.cache).toEqual({
      inputTokens: 5,
      cacheCreation: {
        ephemeral5mInputTokens: 21
      },
      effective: "write"
    });
  });

  it("uses the streaming executor and reports activity as stdout lines arrive", async () => {
    const activity: string[] = [];
    let observedSignal: AbortSignal | undefined;
    const controller = new AbortController();
    const lines = [
      JSON.stringify({ type: "system", subtype: "init" }),
      JSON.stringify({
        type: "assistant",
        message: {
          content: [{ type: "text", text: "Streaming progress." }]
        }
      }),
      JSON.stringify({
        type: "result",
        result: "Final streaming review.",
        usage: {
          input_tokens: 4,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 12,
          cache_creation: {
            ephemeral_1h_input_tokens: 0
          }
        }
      })
    ];
    const executeStreaming: StreamingClaudeExecutor = async (
      _command,
      _args,
      options,
      onStdoutLine
    ) => {
      observedSignal = options.signal;
      for (const line of lines) {
        onStdoutLine(line);
      }
      return {
        stdout: lines.join("\n"),
        stderr: "",
        exitCode: 0
      };
    };

    const result = await runClaudeReview(baseInput, {
      executeStreaming,
      signal: controller.signal,
      onActivity: (event) => activity.push(`${event.kind}:${event.summary}`),
      now: fakeClock([1, 2]),
      buildPacket: async () => "PACKET"
    });

    expect(observedSignal).toBe(controller.signal);
    expect(activity).toEqual([
      "system:system:init",
      "assistant_text:Streaming progress.",
      "result:result"
    ]);
    expect(result.review).toBe("Final streaming review.");
    expect(result.activityTail?.map((event) => event.kind)).toEqual([
      "system",
      "assistant_text",
      "result"
    ]);
    expect(result.cache).toEqual({
      inputTokens: 4,
      creationInputTokens: 0,
      readInputTokens: 12,
      cacheCreation: {
        ephemeral1hInputTokens: 0
      },
      effective: "hit"
    });
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

  it("does not build the packet when the request is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    let builtPacket = false;

    const result = await runClaudeReview(baseInput, {
      signal: controller.signal,
      buildPacket: async () => {
        builtPacket = true;
        return "PACKET";
      },
      now: fakeClock([10, 20])
    });

    expect(builtPacket).toBe(false);
    expect(result.ok).toBe(false);
    expect(result.review).toContain("cancelled");
    expect(result.diagnostics?.join("\n")).toContain("aborted");
  });
});

function fakeClock(values: number[]): () => number {
  let index = 0;
  return () => values[index++] ?? values.at(-1) ?? 0;
}
