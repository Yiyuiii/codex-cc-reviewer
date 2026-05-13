import { afterEach, describe, expect, it, vi } from "vitest";

import { createProgressReporter } from "../src/mcp/progress.js";
import type { CcReviewActivityEvent } from "../src/review/activity.js";

const toolUseEvent: CcReviewActivityEvent = {
  index: 1,
  kind: "tool_use",
  rawType: "assistant.tool_use",
  summary: "tool_use: Read {\"file_path\":\"README.md\"}",
  toolName: "Read",
  toolInput: { file_path: "README.md" }
};

describe("createProgressReporter", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends MCP progress notifications with increasing progress when a token exists", async () => {
    const notifications: unknown[] = [];
    const reporter = createProgressReporter(
      {
        _meta: { progressToken: "token-1" },
        sendNotification: async (notification: unknown) => {
          notifications.push(notification);
        }
      },
      { throttleMs: 0 }
    );

    reporter.onActivity({
      index: 0,
      kind: "system",
      rawType: "system:init",
      summary: "system:init"
    });
    reporter.onActivity(toolUseEvent);
    await reporter.finish();

    expect(notifications).toEqual([
      {
        method: "notifications/progress",
        params: {
          progressToken: "token-1",
          progress: 1,
          message: "system:init"
        }
      },
      {
        method: "notifications/progress",
        params: {
          progressToken: "token-1",
          progress: 2,
          message: "tool_use: Read {\"file_path\":\"README.md\"}"
        }
      }
    ]);
    expect(reporter.getDiagnostics()).toEqual([]);
  });

  it("no-ops without a progress token and exposes a diagnostic", async () => {
    const notifications: unknown[] = [];
    const reporter = createProgressReporter(
      {
        sendNotification: async (notification: unknown) => {
          notifications.push(notification);
        }
      },
      { throttleMs: 0 }
    );

    reporter.onActivity(toolUseEvent);
    await reporter.finish();

    expect(notifications).toEqual([]);
    expect(reporter.getDiagnostics().join("\n")).toContain("progressToken");
  });

  it("coalesces throttled events, flushes on finish, and records notification failures", async () => {
    vi.useFakeTimers();
    const notifications: unknown[] = [];
    const reporter = createProgressReporter(
      {
        _meta: { progressToken: "token-2" },
        sendNotification: async (notification: unknown) => {
          notifications.push(notification);
          if (notifications.length === 2) {
            throw new Error("send failed");
          }
        }
      },
      { throttleMs: 1_000 }
    );

    reporter.onActivity({
      index: 1,
      kind: "assistant_text",
      rawType: "assistant.text",
      summary: "first text"
    });
    reporter.onActivity({
      index: 2,
      kind: "assistant_text",
      rawType: "assistant.text",
      summary: "second text"
    });
    expect(notifications).toEqual([]);

    reporter.onActivity(toolUseEvent);
    await vi.runOnlyPendingTimersAsync();
    await reporter.finish();

    expect(notifications).toEqual([
      {
        method: "notifications/progress",
        params: {
          progressToken: "token-2",
          progress: 1,
          message: "tool_use: Read {\"file_path\":\"README.md\"}"
        }
      }
    ]);

    reporter.onActivity({
      index: 3,
      kind: "assistant_text",
      rawType: "assistant.text",
      summary: "final text"
    });
    await reporter.finish();

    expect(notifications.at(-1)).toEqual({
      method: "notifications/progress",
      params: {
        progressToken: "token-2",
        progress: 2,
        message: "final text"
      }
    });
    expect(reporter.getDiagnostics().join("\n")).toContain("send failed");
  });
});
