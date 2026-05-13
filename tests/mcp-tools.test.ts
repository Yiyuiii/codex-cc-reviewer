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
