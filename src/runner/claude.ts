import { execa } from "execa";

import { buildReviewPacket } from "../review/packet.js";
import type { CcReviewInput, CcReviewOutput } from "../review/schema.js";

const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const REVIEW_STDIN_PROMPT = "Review the packet provided on stdin.";

export interface ClaudeExecuteOptions {
  cwd: string;
  input: string;
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
    reject: false,
    timeout: deps.timeoutMs ?? DEFAULT_TIMEOUT_MS
  });

  const elapsedMs = Math.max(0, now() - started);
  const parsed = parseClaudeOutput(child.stdout);

  return {
    ok: child.exitCode === 0,
    task: input.task,
    model: input.model,
    elapsedMs,
    review: parsed.review,
    structured: parsed.structured,
    command: ["claude", ...args.map(redactLongArg)],
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
    "--tools",
    input.tools.join(","),
    "--output-format",
    "json",
    "--max-turns",
    String(input.maxTurns),
    "--no-session-persistence"
  ];

  if (input.maxBudgetUsd !== undefined) {
    args.push("--max-budget-usd", String(input.maxBudgetUsd));
  }

  if (input.output === "json") {
    args.push("--json-schema", JSON.stringify(REVIEW_JSON_SCHEMA));
  }

  return args;
}

function parseClaudeOutput(stdout: string): { review: string; structured?: unknown } {
  try {
    const parsed = JSON.parse(stdout) as {
      result?: unknown;
      message?: unknown;
      structured_output?: unknown;
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
      structured: parsed.structured_output
    };
  } catch {
    return { review: stdout };
  }
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
    exitCode: result.exitCode
  };
}

function redactLongArg(value: string): string {
  if (value.length <= 200) {
    return value;
  }

  return `${value.slice(0, 200)}...`;
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
