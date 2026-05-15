import { afterEach, describe, expect, it, vi } from "vitest";

import { registerCcReviewTool } from "../src/mcp/tools.js";
import type { CcReviewOutput } from "../src/review/schema.js";

describe("registerCcReviewTool", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("passes MCP progress and cancellation hooks into runClaudeReview", async () => {
    let callback: ((input: unknown, extra: unknown) => Promise<unknown>) | undefined;
    const server = {
      registerTool: (_name: string, _config: unknown, cb: typeof callback) => {
        callback = cb;
      }
    };
    const signal = new AbortController().signal;
    const notifications: unknown[] = [];
    let observedSignal: AbortSignal | undefined;
    let observedHasActivity = false;

    registerCcReviewTool(server as never, {
      runReview: async (_input, deps) => {
        expect(deps).toBeDefined();
        if (!deps) {
          throw new Error("Expected runReview deps");
        }
        observedSignal = deps.signal;
        observedHasActivity = typeof deps.onActivity === "function";
        deps.onActivity?.({
          index: 1,
          kind: "tool_use",
          rawType: "assistant.tool_use",
          summary: "tool_use: Read {}",
          toolName: "Read",
          toolInput: {}
        });

        return {
          ok: true,
          task: "review_plan",
          model: "opus",
          elapsedMs: 1,
          review: "No findings.",
          command: ["claude"]
        } satisfies CcReviewOutput;
      }
    });

    const result = (await callback?.(
      { task: "review_plan", context: "Plan" },
      {
        signal,
        _meta: { progressToken: "progress-1" },
        sendNotification: async (notification: unknown) => {
          notifications.push(notification);
        }
      }
    )) as { structuredContent: CcReviewOutput };

    expect(observedSignal).toBe(signal);
    expect(observedHasActivity).toBe(true);
    expect(notifications).toEqual([
      {
        method: "notifications/progress",
        params: {
          progressToken: "progress-1",
          progress: 1,
          message: "tool_use: Read {}"
        }
      }
    ]);
    expect(result.structuredContent.review).toBe("No findings.");
  });

  it("advertises review profile in the MCP input schema", () => {
    let observedConfig: { inputSchema?: Record<string, unknown>; description?: string } | undefined;
    const server = {
      registerTool: (_name: string, config: typeof observedConfig) => {
        observedConfig = config;
      }
    };

    registerCcReviewTool(server as never);

    expect(observedConfig?.inputSchema).toHaveProperty("reviewProfile");
    expect(observedConfig?.inputSchema).toHaveProperty("tools");
    expect(observedConfig?.inputSchema).toHaveProperty("maxContextChars");
    expect(getSchemaDescription(observedConfig?.inputSchema?.tools)).toContain("Omitted runtime default");
    expect(getSchemaDescription(observedConfig?.inputSchema?.maxContextChars)).toContain(
      "Omitted runtime default"
    );
    expect(observedConfig?.description).toContain("reviewProfile=read_only");
  });

  it("applies read_only defaults through the MCP callback parse path", async () => {
    let callback: ((input: unknown, extra: unknown) => Promise<unknown>) | undefined;
    let observedInput: unknown;
    const server = {
      registerTool: (_name: string, _config: unknown, cb: typeof callback) => {
        callback = cb;
      }
    };

    registerCcReviewTool(server as never, {
      runReview: async (input) => {
        observedInput = input;
        return {
          ok: true,
          task: "review_diff",
          model: "opus",
          elapsedMs: 1,
          review: "No findings.",
          command: ["claude"]
        } satisfies CcReviewOutput;
      }
    });

    await callback?.(
      {
        task: "review_diff",
        context: "Review this diff.",
        reviewProfile: "read_only"
      },
      {
        signal: new AbortController().signal
      }
    );

    expect(observedInput).toMatchObject({
      reviewProfile: "read_only",
      tools: ["Read", "Grep", "Glob"],
      maxContextChars: 60_000,
      includeUntrackedContent: false
    });
  });

  it("rejects unknown MCP callback fields before running a review", async () => {
    let callback: ((input: unknown, extra: unknown) => Promise<unknown>) | undefined;
    let reachedRunner = false;
    const server = {
      registerTool: (_name: string, _config: unknown, cb: typeof callback) => {
        callback = cb;
      }
    };

    registerCcReviewTool(server as never, {
      runReview: async () => {
        reachedRunner = true;
        return {
          ok: true,
          task: "review_plan",
          model: "opus",
          elapsedMs: 1,
          review: "No findings.",
          command: ["claude"]
        } satisfies CcReviewOutput;
      }
    });

    await expect(
      callback?.(
        {
          task: "review_plan",
          context: "Plan",
          unknownOption: true
        },
        {
          signal: new AbortController().signal
        }
      )
    ).rejects.toThrow(/unrecognized/i);

    expect(reachedRunner).toBe(false);
  });

  it("finishes progress reporting when runClaudeReview throws", async () => {
    vi.useFakeTimers();
    let callback: ((input: unknown, extra: unknown) => Promise<unknown>) | undefined;
    const notifications: unknown[] = [];
    const server = {
      registerTool: (_name: string, _config: unknown, cb: typeof callback) => {
        callback = cb;
      }
    };

    registerCcReviewTool(server as never, {
      runReview: async (_input, deps) => {
        deps?.onActivity?.({
          index: 1,
          kind: "assistant_text",
          rawType: "assistant.text",
          summary: "pending progress"
        });
        throw new Error("review failed");
      }
    });

    await expect(
      callback?.(
        { task: "review_plan", context: "Plan" },
        {
          _meta: { progressToken: "progress-2" },
          sendNotification: async (notification: unknown) => {
            notifications.push(notification);
          },
          signal: new AbortController().signal
        }
      )
    ).rejects.toThrow("review failed");

    expect(notifications).toEqual([
      {
        method: "notifications/progress",
        params: {
          progressToken: "progress-2",
          progress: 1,
          message: "pending progress"
        }
      }
    ]);

    await vi.runOnlyPendingTimersAsync();
    expect(notifications).toHaveLength(1);
  });
});

function getSchemaDescription(schema: unknown): string | undefined {
  return (schema as { description?: string } | undefined)?.description;
}
