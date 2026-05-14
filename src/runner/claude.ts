import { execa } from "execa";
import { createInterface } from "node:readline";
import type { Readable } from "node:stream";

import { buildReviewPacket } from "../review/packet.js";
import { createClaudeStreamParser } from "../review/activity.js";
import type { CcReviewActivityEvent } from "../review/activity.js";
import { analyzeCacheUsage, parseCacheUsage } from "../review/cache.js";
import type { CacheUsage } from "../review/cache.js";
import type { CcReviewInput, CcReviewOutput } from "../review/schema.js";

const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const REVIEW_STDIN_PROMPT = "Review the packet provided on stdin.";

export interface ClaudeExecuteOptions {
  cwd: string;
  input: string;
  env?: Record<string, string>;
  reject: false;
  timeout: number;
  signal?: AbortSignal;
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

export type StreamingClaudeExecutor = (
  command: string,
  args: string[],
  options: ClaudeExecuteOptions,
  onStdoutLine: (line: string) => void,
  onStderrLine: (line: string) => void
) => Promise<ClaudeExecuteResult>;

export interface RunClaudeReviewDeps {
  execute?: ClaudeExecutor;
  executeStreaming?: StreamingClaudeExecutor;
  onActivity?: (event: CcReviewActivityEvent) => void;
  now?: () => number;
  buildPacket?: (input: CcReviewInput) => Promise<string>;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export async function runClaudeReview(
  input: CcReviewInput,
  deps: RunClaudeReviewDeps = {}
): Promise<CcReviewOutput> {
  const now = deps.now ?? Date.now;
  const execute = deps.execute ?? defaultExecute;
  const makePacket = deps.buildPacket ?? buildReviewPacket;
  const started = now();
  const args = buildClaudeArgs(input);

  if (deps.signal?.aborted) {
    return buildCancelledReview(input, args, Math.max(0, now() - started));
  }

  const packet = await makePacket(input);

  if (deps.signal?.aborted) {
    return buildCancelledReview(input, args, Math.max(0, now() - started));
  }

  const options = {
    cwd: input.cwd ?? process.cwd(),
    input: packet,
    env: buildClaudeEnv(input),
    reject: false,
    timeout: deps.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    signal: deps.signal
  } satisfies ClaudeExecuteOptions;

  let child: ClaudeExecuteResult;
  let parsed: ParsedClaudeOutput;

  if (input.stream && (deps.executeStreaming || !deps.execute)) {
    const streamed = await runStreamingClaude(
          deps.executeStreaming ?? defaultExecuteStreaming,
          args,
          options,
          deps.onActivity
        );
    child = streamed.child;
    parsed = streamed.parsed;
  } else {
    child = await execute("claude", args, options);
    parsed = parseClaudeOutput(child.stdout, input.stream, deps.onActivity);
  }

  const elapsedMs = Math.max(0, now() - started);
  const cacheAnalysis = analyzeCacheUsage(input.cacheTtl, parsed.cache);
  const diagnostics = [
    ...(parsed.diagnostics ?? []),
    ...cacheAnalysis.diagnostics
  ];

  return {
    ok: child.exitCode === 0,
    task: input.task,
    model: input.model,
    elapsedMs,
    review: parsed.review,
    structured: parsed.structured,
    command: ["claude", ...args.map(redactLongArg)],
    eventsTail: parsed.eventsTail,
    transcriptTail: parsed.transcriptTail,
    activityTail: parsed.activityTail,
    eventCount: parsed.eventCount,
    cache: cacheAnalysis.cache,
    costUsd: parsed.costUsd,
    diagnostics: diagnostics.length ? diagnostics : undefined,
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

  args.push("--no-session-persistence");

  if (input.output === "json") {
    args.push("--json-schema", JSON.stringify(REVIEW_JSON_SCHEMA));
  }

  return args;
}

function buildClaudeEnv(input: CcReviewInput): Record<string, string> | undefined {
  return {
    ENABLE_PROMPT_CACHING_1H: input.cacheTtl === "1h" ? "1" : "0"
  };
}

interface ParsedClaudeOutput {
  review: string;
  structured?: unknown;
  eventsTail?: string[];
  transcriptTail?: string[];
  activityTail?: CcReviewActivityEvent[];
  eventCount?: number;
  cache?: Omit<CacheUsage, "effective">;
  costUsd?: number;
  diagnostics?: string[];
}

function parseClaudeOutput(
  stdout: string,
  stream: boolean,
  onActivity?: (event: CcReviewActivityEvent) => void
): ParsedClaudeOutput {
  if (stream) {
    return parseClaudeStreamOutput(stdout, onActivity);
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

function parseClaudeStreamOutput(
  stdout: string,
  onActivity?: (event: CcReviewActivityEvent) => void
): ParsedClaudeOutput {
  const parser = createClaudeStreamParser({ onActivity });
  for (const line of stdout.split(/\r?\n/)) {
    parser.pushLine(line);
  }
  const parsed = parser.finish();
  return {
    ...parsed,
    review: parsed.review || stdout
  };
}

async function defaultExecute(
  command: string,
  args: string[],
  options: ClaudeExecuteOptions
): Promise<ClaudeExecuteResult> {
  const result = await execa(command, args, buildExecaOptions(options));

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode ?? null
  };
}

function buildCancelledReview(
  input: CcReviewInput,
  args: string[],
  elapsedMs: number
): CcReviewOutput {
  return {
    ok: false,
    task: input.task,
    model: input.model,
    elapsedMs,
    review: "Claude Code review cancelled before the subprocess started.",
    command: ["claude", ...args.map(redactLongArg)],
    diagnostics: ["Review request was already aborted before Claude Code started."]
  };
}

async function runStreamingClaude(
  executeStreaming: StreamingClaudeExecutor,
  args: string[],
  options: ClaudeExecuteOptions,
  onActivity?: (event: CcReviewActivityEvent) => void
): Promise<{ child: ClaudeExecuteResult; parsed: ParsedClaudeOutput }> {
  const parser = createClaudeStreamParser({ onActivity });

  const result = await executeStreaming(
    "claude",
    args,
    options,
    (line) => parser.pushLine(line),
    () => undefined
  );

  const parsed = parser.finish();
  return { child: result, parsed };
}

async function defaultExecuteStreaming(
  command: string,
  args: string[],
  options: ClaudeExecuteOptions,
  onStdoutLine: (line: string) => void,
  onStderrLine: (line: string) => void
): Promise<ClaudeExecuteResult> {
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  let result: Awaited<ReturnType<typeof execa>> | undefined;
  let caughtError: unknown;

  const subprocess = execa(command, args, buildExecaOptions(options));
  const stdoutTask = collectLines(subprocess.stdout, stdoutLines, onStdoutLine);
  const stderrTask = collectLines(subprocess.stderr, stderrLines, onStderrLine);

  try {
    result = await subprocess;
  } catch (error) {
    caughtError = error;
  } finally {
    await Promise.allSettled([stdoutTask, stderrTask]);
  }

  if (result) {
    return {
      stdout: stdoutLines.join("\n") || outputToString(result.stdout),
      stderr: stderrLines.join("\n") || outputToString(result.stderr),
      exitCode: result.exitCode ?? null
    };
  }

  const maybeResult = caughtError as {
    stdout?: string;
    stderr?: string;
    exitCode?: number;
  };
  return {
    stdout: stdoutLines.join("\n") || maybeResult.stdout || "",
    stderr: stderrLines.join("\n") || maybeResult.stderr || String(caughtError),
    exitCode: maybeResult.exitCode ?? null
  };
}

async function collectLines(
  stream: Readable | null,
  target: string[],
  onLine: (line: string) => void
): Promise<void> {
  if (!stream) {
    return;
  }

  const lines = createInterface({
    input: stream,
    crlfDelay: Infinity
  });

  for await (const line of lines) {
    target.push(line);
    onLine(line);
  }
}

function redactLongArg(value: string): string {
  if (value.length <= 200) {
    return value;
  }

  return `${value.slice(0, 200)}[TRUNCATED]`;
}

export function buildExecaOptions(
  options: ClaudeExecuteOptions
): Omit<ClaudeExecuteOptions, "signal"> & { cancelSignal?: AbortSignal } {
  const { signal, ...rest } = options;

  return {
    ...rest,
    ...(signal ? { cancelSignal: signal } : {})
  };
}

function outputToString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value === undefined || value === null) {
    return "";
  }

  if (value instanceof Uint8Array) {
    return new TextDecoder().decode(value);
  }

  return String(value);
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
          evidence: { type: "string" },
          issue: { type: "string" },
          impact: { type: "string" },
          rationale: { type: "string" },
          suggested_change: { type: "string" },
          confidence: {
            type: "string",
            enum: ["high", "medium", "low"]
          },
          blocking: { type: "boolean" }
        },
        required: ["severity", "category", "location", "issue", "rationale", "suggested_change"],
        additionalProperties: false
      }
    },
    needs_verification: {
      type: "array",
      items: {
        type: "object",
        properties: {
          hypothesis: { type: "string" },
          how_to_verify: { type: "string" }
        },
        required: ["hypothesis", "how_to_verify"],
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
