import { execa } from "execa";

import { buildReviewPacket } from "../review/packet.js";
import type { CcReviewInput, CcReviewOutput } from "../review/schema.js";

const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const REVIEW_STDIN_PROMPT = "Review the packet provided on stdin.";

export interface ClaudeExecuteOptions {
  cwd: string;
  input: string;
  env?: Record<string, string>;
  reject: false;
  timeout: number;
}

export interface ClaudeExecuteResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export type ClaudeExecutor = (
  command: string,
  args: string[],
  options: ClaudeExecuteOptions
) => Promise<ClaudeExecuteResult>;

export interface RunClaudeReviewDeps {
  execute?: ClaudeExecutor;
  now?: () => number;
  buildPacket?: (input: CcReviewInput) => Promise<string>;
  timeoutMs?: number;
}

export async function runClaudeReview(
  input: CcReviewInput,
  deps: RunClaudeReviewDeps = {}
): Promise<CcReviewOutput> {
  const now = deps.now ?? Date.now;
  const execute = deps.execute ?? defaultExecute;
  const makePacket = deps.buildPacket ?? buildReviewPacket;
  const started = now();
  const packet = await makePacket(input);
  const args = buildClaudeArgs(input);

  const child = await execute("claude", args, {
    cwd: input.cwd ?? process.cwd(),
    input: packet,
    env: buildClaudeEnv(input),
    reject: false,
    timeout: deps.timeoutMs ?? DEFAULT_TIMEOUT_MS
  });

  const elapsedMs = Math.max(0, now() - started);
  const parsed = parseClaudeOutput(child.stdout, input.stream);

  return {
    ok: child.exitCode === 0,
    task: input.task,
    model: input.model,
    elapsedMs,
    review: parsed.review,
    structured: parsed.structured,
    command: ["claude", ...args.map(redactLongArg)],
    eventsTail: parsed.eventsTail,
    eventCount: parsed.eventCount,
    cache: parsed.cache,
    costUsd: parsed.costUsd,
    stderrTail: child.stderr ? child.stderr.slice(-4_000) : undefined,
    exitCode: child.exitCode ?? undefined
  };
}

export function buildClaudeArgs(input: CcReviewInput): string[] {
  const args = [
    "-p",
    REVIEW_STDIN_PROMPT,
    "--model",
    input.model,
    "--effort",
    input.effort,
    "--permission-mode",
    input.permissionMode,
  ];

  if (input.permissionMode === "bypassPermissions") {
    args.push("--dangerously-skip-permissions");
  }

  args.push(
    "--tools",
    input.tools.join(","),
    "--output-format",
    input.stream ? "stream-json" : "json"
  );

  if (input.stream && input.verbose) {
    args.push("--verbose");
  }

  if (input.stream && input.includePartialMessages) {
    args.push("--include-partial-messages");
  }

  if (input.stream && input.includeHookEvents) {
    args.push("--include-hook-events");
  }

  args.push(
    "--max-turns",
    String(input.maxTurns),
    "--no-session-persistence"
  );

  if (input.maxBudgetUsd !== undefined) {
    args.push("--max-budget-usd", String(input.maxBudgetUsd));
  }

  if (input.output === "json") {
    args.push("--json-schema", JSON.stringify(REVIEW_JSON_SCHEMA));
  }

  return args;
}

function buildClaudeEnv(input: CcReviewInput): Record<string, string> | undefined {
  if (input.cacheTtl !== "1h") {
    return undefined;
  }

  return {
    ENABLE_PROMPT_CACHING_1H: "1"
  };
}

interface ParsedClaudeOutput {
  review: string;
  structured?: unknown;
  eventsTail?: string[];
  eventCount?: number;
  cache?: {
    creationInputTokens?: number;
    readInputTokens?: number;
  };
  costUsd?: number;
}

function parseClaudeOutput(stdout: string, stream: boolean): ParsedClaudeOutput {
  if (stream) {
    return parseClaudeStreamOutput(stdout);
  }

  try {
    const parsed = JSON.parse(stdout) as {
      result?: unknown;
      message?: unknown;
      structured_output?: unknown;
      usage?: unknown;
      total_cost_usd?: unknown;
    };

    const review =
      typeof parsed.result === "string"
        ? parsed.result
        : typeof parsed.message === "string"
          ? parsed.message
          : parsed.structured_output !== undefined
            ? JSON.stringify(parsed.structured_output, null, 2)
            : stdout;

    return {
      review,
      structured: parsed.structured_output,
      cache: parseCacheUsage(parsed.usage),
      costUsd: typeof parsed.total_cost_usd === "number" ? parsed.total_cost_usd : undefined
    };
  } catch {
    return { review: stdout };
  }
}

function parseClaudeStreamOutput(stdout: string): ParsedClaudeOutput {
  const events: string[] = [];
  let review = "";
  let structured: unknown;
  let cache: ParsedClaudeOutput["cache"];
  let costUsd: number | undefined;
  let eventCount = 0;
  const textDeltas: string[] = [];

  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let event: Record<string, unknown>;
    try {
      event = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      continue;
    }

    eventCount += 1;
    const summary = summarizeStreamEvent(event);
    if (summary) {
      events.push(summary);
    }

    if (event.type === "stream_event") {
      const deltaText = getTextDelta(event);
      if (deltaText) {
        textDeltas.push(deltaText);
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

  return {
    review: review || textDeltas.join("") || stdout,
    structured,
    eventsTail: events.slice(-50),
    eventCount,
    cache,
    costUsd
  };
}

function summarizeStreamEvent(event: Record<string, unknown>): string | undefined {
  if (event.type === "system") {
    return `system:${String(event.subtype ?? "event")}`;
  }

  if (event.type === "result") {
    return "result";
  }

  if (event.type === "assistant") {
    return summarizeAssistantMessage(event);
  }

  if (event.type === "stream_event") {
    const streamEvent = event.event as Record<string, unknown> | undefined;
    if (streamEvent?.type === "content_block_start") {
      const block = streamEvent.content_block as Record<string, unknown> | undefined;
      if (block?.type === "tool_use") {
        return `tool_start: ${String(block.name ?? "unknown")}`;
      }
    }
    if (streamEvent?.type === "message_delta") {
      return "message_delta";
    }
    return undefined;
  }

  return typeof event.type === "string" ? event.type : undefined;
}

function summarizeAssistantMessage(event: Record<string, unknown>): string | undefined {
  const message = event.message as Record<string, unknown> | undefined;
  const content = message?.content;
  if (!Array.isArray(content)) {
    return "assistant";
  }

  for (const item of content) {
    const block = item as Record<string, unknown>;
    if (block.type === "tool_use") {
      return `tool_use: ${String(block.name ?? "unknown")} ${JSON.stringify(block.input ?? {})}`;
    }
  }

  return "assistant";
}

function getTextDelta(event: Record<string, unknown>): string | undefined {
  const streamEvent = event.event as Record<string, unknown> | undefined;
  const delta = streamEvent?.delta as Record<string, unknown> | undefined;
  if (streamEvent?.type === "content_block_delta" && delta?.type === "text_delta") {
    return typeof delta.text === "string" ? delta.text : undefined;
  }

  return undefined;
}

function parseCacheUsage(usage: unknown): ParsedClaudeOutput["cache"] {
  if (!usage || typeof usage !== "object") {
    return undefined;
  }

  const record = usage as Record<string, unknown>;
  const creationInputTokens =
    typeof record.cache_creation_input_tokens === "number"
      ? record.cache_creation_input_tokens
      : undefined;
  const readInputTokens =
    typeof record.cache_read_input_tokens === "number" ? record.cache_read_input_tokens : undefined;

  if (creationInputTokens === undefined && readInputTokens === undefined) {
    return undefined;
  }

  return {
    creationInputTokens,
    readInputTokens
  };
}

async function defaultExecute(
  command: string,
  args: string[],
  options: ClaudeExecuteOptions
): Promise<ClaudeExecuteResult> {
  const result = await execa(command, args, options);

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode ?? null
  };
}

function redactLongArg(value: string): string {
  if (value.length <= 200) {
    return value;
  }

  return `${value.slice(0, 200)}[TRUNCATED]`;
}

const REVIEW_JSON_SCHEMA = {
  type: "object",
  properties: {
    verdict: {
      type: "string",
      enum: ["approve", "needs_changes", "blocked"]
    },
    summary: { type: "string" },
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          severity: {
            type: "string",
            enum: ["critical", "major", "minor", "note"]
          },
          category: {
            type: "string",
            enum: ["correctness", "security", "tests", "maintainability", "docs", "other"]
          },
          location: { type: "string" },
          issue: { type: "string" },
          rationale: { type: "string" },
          suggested_change: { type: "string" }
        },
        required: ["severity", "category", "location", "issue", "rationale", "suggested_change"],
        additionalProperties: false
      }
    },
    missing_context: {
      type: "array",
      items: { type: "string" }
    }
  },
  required: ["verdict", "summary", "findings", "missing_context"],
  additionalProperties: false
} as const;
