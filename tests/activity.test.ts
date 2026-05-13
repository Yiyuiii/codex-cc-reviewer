import { describe, expect, it } from "vitest";

import { createClaudeStreamParser } from "../src/review/activity.js";

describe("createClaudeStreamParser", () => {
  it("builds structured activity and transcript from a multi-turn Claude stream", () => {
    const observed: string[] = [];
    const parser = createClaudeStreamParser({
      onActivity: (event) => observed.push(`${event.index}:${event.kind}:${event.summary}`)
    });

    for (const line of [
      json({ type: "system", subtype: "init" }),
      json({
        type: "stream_event",
        event: {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "I will inspect " }
        }
      }),
      json({
        type: "stream_event",
        event: {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "the repo." }
        }
      }),
      json({
        type: "assistant",
        message: {
          content: [
            { type: "text", text: "Intermediate finding." },
            { type: "tool_use", name: "Read", input: { file_path: "README.md" } }
          ]
        }
      }),
      json({
        type: "user",
        message: {
          content: [
            { type: "text", text: "User-side message." },
            { type: "tool_result", tool_use_id: "tool-1", content: "README contents" }
          ]
        }
      }),
      json({
        type: "assistant",
        message: {
          content: [{ type: "text", text: "Second turn." }]
        }
      }),
      json({
        type: "result",
        result: "Final review.",
        total_cost_usd: 0.42,
        usage: {
          cache_creation_input_tokens: 100,
          cache_read_input_tokens: 200
        }
      })
    ]) {
      parser.pushLine(line);
    }

    const result = parser.finish();

    expect(result.review).toBe("Final review.");
    expect(result.costUsd).toBe(0.42);
    expect(result.cache).toEqual({
      creationInputTokens: 100,
      readInputTokens: 200
    });
    expect(result.transcriptTail).toEqual([
      "I will inspect the repo.",
      "Intermediate finding.",
      "Second turn."
    ]);
    expect(result.activityTail.map((event) => event.kind)).toEqual([
      "system",
      "text_delta",
      "text_delta",
      "assistant_text",
      "tool_use",
      "user_text",
      "tool_result",
      "assistant_text",
      "result"
    ]);
    expect(result.activityTail[0]).toMatchObject({
      index: 1,
      kind: "system",
      rawType: "system:init",
      summary: "system:init"
    });
    expect(result.activityTail[4]).toMatchObject({
      kind: "tool_use",
      rawType: "assistant.tool_use",
      toolName: "Read",
      toolInput: { file_path: "README.md" }
    });
    expect(result.activityTail[5]).toMatchObject({
      kind: "user_text",
      rawType: "user.text"
    });
    expect(result.activityTail[6]).toMatchObject({
      kind: "tool_result",
      rawType: "user.tool_result"
    });
    expect(observed.some((item) => item.includes("tool_use: Read"))).toBe(true);
  });

  it("preserves unknown raw types and bounds large activity details", () => {
    const parser = createClaudeStreamParser({
      maxActivityEvents: 2,
      maxTextChars: 20,
      maxToolInputChars: 40
    });

    parser.pushLine(json({ type: "future_event", payload: { value: "x" } }));
    parser.pushLine(
      json({
        type: "assistant",
        message: {
          content: [{ type: "text", text: "x".repeat(100) }]
        }
      })
    );
    parser.pushLine(
      json({
        type: "assistant",
        message: {
          content: [{ type: "tool_use", name: "Big", input: { content: "y".repeat(100) } }]
        }
      })
    );

    const result = parser.finish();

    expect(result.activityTail).toHaveLength(2);
    expect(result.activityTail[0]).toMatchObject({
      kind: "assistant_text",
      rawType: "assistant.text"
    });
    expect(result.activityTail[0].text).toContain("[TRUNCATED");
    expect(result.activityTail[1]).toMatchObject({
      kind: "tool_use",
      rawType: "assistant.tool_use",
      toolName: "Big",
      toolInputTruncated: true
    });
    expect(result.activityTail[1].toolInput).toBeUndefined();
    expect(result.activityTail[1].toolInputPreview?.length).toBeLessThanOrEqual(80);
  });

  it("bounds legacy events and aggregates non-JSON diagnostics", () => {
    const parser = createClaudeStreamParser({
      maxActivityEvents: 5
    });

    parser.pushLine("not-json-1");
    parser.pushLine("not-json-2");
    for (let index = 0; index < 75; index += 1) {
      parser.pushLine(json({ type: "system", subtype: `event_${index}` }));
    }

    const result = parser.finish();

    expect(result.eventsTail).toHaveLength(50);
    expect(result.eventsTail[0]).toBe("system:event_25");
    expect(result.diagnostics).toEqual([
      "Ignored 2 non-JSON lines from Claude Code stream output."
    ]);
  });
});

function json(value: unknown): string {
  return JSON.stringify(value);
}
