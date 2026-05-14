import { parseCacheUsage } from "./cache.js";
import type { CacheUsage } from "./cache.js";

export type CcReviewActivityKind =
  | "system"
  | "assistant_text"
  | "user_text"
  | "text_delta"
  | "tool_use"
  | "tool_result"
  | "hook"
  | "message_delta"
  | "result"
  | "stderr"
  | "unknown";

export interface CcReviewActivityEvent {
  index: number;
  kind: CcReviewActivityKind;
  rawType: string;
  summary: string;
  text?: string;
  toolName?: string;
  toolInput?: unknown;
  toolInputPreview?: string;
  toolInputTruncated?: boolean;
}

export interface ParsedClaudeActivity {
  review: string;
  structured?: unknown;
  eventsTail: string[];
  transcriptTail: string[];
  activityTail: CcReviewActivityEvent[];
  eventCount: number;
  cache?: Omit<CacheUsage, "effective">;
  costUsd?: number;
  diagnostics: string[];
}

export interface ClaudeStreamParserOptions {
  onActivity?: (event: CcReviewActivityEvent) => void;
  maxActivityEvents?: number;
  maxTranscriptItems?: number;
  maxTextChars?: number;
  maxToolInputChars?: number;
}

const DEFAULT_MAX_ACTIVITY_EVENTS = 200;
const DEFAULT_MAX_TRANSCRIPT_ITEMS = 20;
const DEFAULT_MAX_TEXT_CHARS = 4_000;
const DEFAULT_MAX_TOOL_INPUT_CHARS = 2_000;

export function createClaudeStreamParser(options: ClaudeStreamParserOptions = {}) {
  const maxActivityEvents = options.maxActivityEvents ?? DEFAULT_MAX_ACTIVITY_EVENTS;
  const maxTranscriptItems = options.maxTranscriptItems ?? DEFAULT_MAX_TRANSCRIPT_ITEMS;
  const maxTextChars = options.maxTextChars ?? DEFAULT_MAX_TEXT_CHARS;
  const maxToolInputChars = options.maxToolInputChars ?? DEFAULT_MAX_TOOL_INPUT_CHARS;
  const activity: CcReviewActivityEvent[] = [];
  const events: string[] = [];
  const transcript: string[] = [];
  const textDeltas: string[] = [];
  const diagnostics: string[] = [];
  let nonJsonLineCount = 0;
  let review = "";
  let structured: unknown;
  let cache: ParsedClaudeActivity["cache"];
  let costUsd: number | undefined;
  let eventCount = 0;
  let activityIndex = 0;

  function pushLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    let event: Record<string, unknown>;
    try {
      event = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      nonJsonLineCount += 1;
      return;
    }

    eventCount += 1;
    const normalized = normalizeClaudeStreamEvent(event, {
      nextIndex: () => ++activityIndex,
      maxTextChars,
      maxToolInputChars
    });

    for (const item of normalized) {
      appendBounded(activity, item, maxActivityEvents);
      const legacySummary = toLegacyEventSummary(item);
      if (legacySummary) {
        appendBounded(events, legacySummary, 50);
      }
      options.onActivity?.(item);

      if (item.kind === "text_delta" && item.text) {
        textDeltas.push(item.text);
      }

      if (item.kind === "assistant_text" && item.text) {
        flushTextDeltas(textDeltas, transcript, maxTranscriptItems, maxTextChars);
        appendBounded(transcript, item.text, maxTranscriptItems);
      }
    }

    if (event.type === "result") {
      if (typeof event.result === "string") {
        review = event.result;
      }
      if ("structured_output" in event) {
        structured = event.structured_output;
      }
      cache = parseCacheUsage(event.usage);
      costUsd = typeof event.total_cost_usd === "number" ? event.total_cost_usd : undefined;
    }
  }

  function finish(): ParsedClaudeActivity {
    flushTextDeltas(textDeltas, transcript, maxTranscriptItems, maxTextChars);
    if (nonJsonLineCount > 0) {
      diagnostics.push(`Ignored ${nonJsonLineCount} non-JSON lines from Claude Code stream output.`);
    }

    return {
      review: review || transcript.join("\n\n"),
      structured,
      eventsTail: events.slice(-50),
      transcriptTail: transcript.slice(-maxTranscriptItems),
      activityTail: activity.slice(-maxActivityEvents),
      eventCount,
      cache,
      costUsd,
      diagnostics
    };
  }

  return { pushLine, finish };
}

interface NormalizeOptions {
  nextIndex: () => number;
  maxTextChars: number;
  maxToolInputChars: number;
}

export function normalizeClaudeStreamEvent(
  event: Record<string, unknown>,
  options: NormalizeOptions
): CcReviewActivityEvent[] {
  if (event.type === "system") {
    const rawType = `system:${String(event.subtype ?? "event")}`;
    return [
      {
        index: options.nextIndex(),
        kind: String(event.subtype ?? "").startsWith("hook_") ? "hook" : "system",
        rawType,
        summary: rawType
      }
    ];
  }

  if (event.type === "result") {
    return [
      {
        index: options.nextIndex(),
        kind: "result",
        rawType: "result",
        summary: "result"
      }
    ];
  }

  if (event.type === "assistant") {
    return normalizeMessageContent("assistant", event, options);
  }

  if (event.type === "user") {
    return normalizeMessageContent("user", event, options);
  }

  if (event.type === "stream_event") {
    return normalizeStreamEvent(event, options);
  }

  const rawType = typeof event.type === "string" ? event.type : "unknown";
  return [
    {
      index: options.nextIndex(),
      kind: "unknown",
      rawType,
      summary: rawType
    }
  ];
}

function normalizeMessageContent(
  role: "assistant" | "user",
  event: Record<string, unknown>,
  options: NormalizeOptions
): CcReviewActivityEvent[] {
  const message = event.message as Record<string, unknown> | undefined;
  const content = message?.content;
  if (!Array.isArray(content)) {
    return [
      {
        index: options.nextIndex(),
        kind: "unknown",
        rawType: role,
        summary: role
      }
    ];
  }

  const normalized: CcReviewActivityEvent[] = [];
  for (const item of content) {
    const block = item as Record<string, unknown>;
    if (block.type === "text" && typeof block.text === "string") {
      const text = limitChars(block.text.trim(), options.maxTextChars);
      if (text) {
        normalized.push({
          index: options.nextIndex(),
          kind: role === "user" ? "user_text" : "assistant_text",
          rawType: `${role}.text`,
          summary: summarizeText(text),
          text
        });
      }
      continue;
    }

    if (block.type === "tool_use") {
      const toolName = String(block.name ?? "unknown");
      const toolInput = limitToolInput(block.input, options.maxToolInputChars);
      normalized.push({
        index: options.nextIndex(),
        kind: "tool_use",
        rawType: `${role}.tool_use`,
        summary: `tool_use: ${toolName} ${toolInput.preview}`,
        toolName,
        toolInput: toolInput.value,
        toolInputPreview: toolInput.preview,
        toolInputTruncated: toolInput.truncated || undefined
      });
      continue;
    }

    if (block.type === "tool_result") {
      const text = typeof block.content === "string" ? limitChars(block.content, options.maxTextChars) : undefined;
      normalized.push({
        index: options.nextIndex(),
        kind: "tool_result",
        rawType: `${role}.tool_result`,
        summary: text ? `tool_result: ${summarizeText(text)}` : "tool_result",
        text
      });
      continue;
    }

    const rawType = `${role}.${String(block.type ?? "unknown")}`;
    normalized.push({
      index: options.nextIndex(),
      kind: "unknown",
      rawType,
      summary: rawType
    });
  }

  return normalized;
}

function normalizeStreamEvent(
  event: Record<string, unknown>,
  options: NormalizeOptions
): CcReviewActivityEvent[] {
  const streamEvent = event.event as Record<string, unknown> | undefined;
  const rawType = `stream_event.${String(streamEvent?.type ?? "unknown")}`;

  if (streamEvent?.type === "content_block_delta") {
    const delta = streamEvent.delta as Record<string, unknown> | undefined;
    if (delta?.type === "text_delta" && typeof delta.text === "string") {
      const text = limitChars(delta.text, options.maxTextChars);
      return [
        {
          index: options.nextIndex(),
          kind: "text_delta",
          rawType: "stream_event.text_delta",
          summary: "text_delta",
          text
        }
      ];
    }
  }

  if (streamEvent?.type === "message_delta") {
    return [
      {
        index: options.nextIndex(),
        kind: "message_delta",
        rawType,
        summary: "message_delta"
      }
    ];
  }

  if (streamEvent?.type === "content_block_start") {
    const block = streamEvent.content_block as Record<string, unknown> | undefined;
    if (block?.type === "tool_use") {
      const toolName = String(block.name ?? "unknown");
      const toolInput = limitToolInput(block.input, options.maxToolInputChars);
      return [
        {
          index: options.nextIndex(),
          kind: "tool_use",
          rawType: "stream_event.tool_use_start",
          summary: `tool_start: ${toolName}`,
          toolName,
          toolInput: toolInput.value,
          toolInputPreview: toolInput.preview,
          toolInputTruncated: toolInput.truncated || undefined
        }
      ];
    }
  }

  return [
    {
      index: options.nextIndex(),
      kind: "unknown",
      rawType,
      summary: rawType
    }
  ];
}

function flushTextDeltas(
  buffer: string[],
  target: string[],
  maxItems: number,
  maxChars: number
): string | undefined {
  if (!buffer.length) {
    return undefined;
  }

  const text = limitChars(buffer.join("").trim(), maxChars);
  buffer.length = 0;
  if (text) {
    appendBounded(target, text, maxItems);
  }

  return text || undefined;
}

function appendBounded<T>(target: T[], value: T, maxItems: number): void {
  target.push(value);
  while (target.length > maxItems) {
    target.shift();
  }
}

function limitChars(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  const omitted = value.length - maxChars;
  return `${value.slice(0, maxChars)}[TRUNCATED ${omitted} chars]`;
}

function limitToolInput(
  value: unknown,
  maxChars: number
): { value?: unknown; preview: string; truncated: boolean } {
  const serialized = stringifyCompact(value);
  if (serialized.length <= maxChars) {
    return { value, preview: serialized, truncated: false };
  }

  return { preview: limitChars(serialized, maxChars), truncated: true };
}

function summarizeText(value: string): string {
  return value.replace(/\s+/g, " ").slice(0, 200);
}

function stringifyCompact(value: unknown): string {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return String(value);
  }
}

function toLegacyEventSummary(event: CcReviewActivityEvent): string | undefined {
  if (event.kind === "assistant_text" || event.kind === "user_text" || event.kind === "tool_result") {
    return undefined;
  }

  return event.summary;
}
