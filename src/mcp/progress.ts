import type { CcReviewActivityEvent } from "../review/activity.js";

interface ProgressExtra {
  _meta?: {
    progressToken?: string | number;
  };
  sendNotification?: (notification: {
    method: "notifications/progress";
    params: {
      progressToken: string | number;
      progress: number;
      message: string;
    };
  }) => Promise<void>;
}

export interface ProgressReporter {
  onActivity: (event: CcReviewActivityEvent) => void;
  finish: () => Promise<void>;
  getDiagnostics: () => string[];
}

export interface ProgressReporterOptions {
  throttleMs?: number;
  maxMessageChars?: number;
}

const DEFAULT_THROTTLE_MS = 1_000;
const DEFAULT_MAX_MESSAGE_CHARS = 500;

export function createProgressReporter(
  extra: ProgressExtra,
  options: ProgressReporterOptions = {}
): ProgressReporter {
  const progressToken = extra._meta?.progressToken;
  const throttleMs = options.throttleMs ?? DEFAULT_THROTTLE_MS;
  const maxMessageChars = options.maxMessageChars ?? DEFAULT_MAX_MESSAGE_CHARS;
  const diagnostics =
    progressToken === undefined
      ? ["MCP client did not provide progressToken; real-time progress unavailable."]
      : [];
  const pendingSends: Promise<void>[] = [];
  let progress = 0;
  let pendingEvent: CcReviewActivityEvent | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function onActivity(event: CcReviewActivityEvent): void {
    if (progressToken === undefined || !extra.sendNotification) {
      return;
    }

    if (throttleMs <= 0 || isImmediateEvent(event)) {
      clearPendingTimer();
      pendingEvent = undefined;
      send(event);
      return;
    }

    pendingEvent = event;
    if (!timer) {
      timer = setTimeout(() => {
        timer = undefined;
        const eventToSend = pendingEvent;
        pendingEvent = undefined;
        if (eventToSend) {
          send(eventToSend);
        }
      }, throttleMs);
    }
  }

  async function finish(): Promise<void> {
    clearPendingTimer();
    const eventToSend = pendingEvent;
    pendingEvent = undefined;
    if (eventToSend && progressToken !== undefined && extra.sendNotification) {
      send(eventToSend);
    }

    await Promise.all(pendingSends);
  }

  function send(event: CcReviewActivityEvent): void {
    if (progressToken === undefined || !extra.sendNotification) {
      return;
    }

    progress += 1;
    const promise = extra
      .sendNotification({
        method: "notifications/progress",
        params: {
          progressToken,
          progress,
          message: limitMessage(event.summary, maxMessageChars)
        }
      })
      .catch((error: unknown) => {
        diagnostics.push(`Failed to send MCP progress notification: ${String(error)}`);
      });

    pendingSends.push(promise);
  }

  function clearPendingTimer(): void {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
  }

  return {
    onActivity,
    finish,
    getDiagnostics: () => [...diagnostics]
  };
}

function isImmediateEvent(event: CcReviewActivityEvent): boolean {
  return event.kind === "system" || event.kind === "tool_use" || event.kind === "result" || event.kind === "stderr";
}

function limitMessage(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}[TRUNCATED ${value.length - maxChars} chars]`;
}
