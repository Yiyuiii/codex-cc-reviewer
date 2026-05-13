import { getGitDiff as defaultGetGitDiff } from "../git/diff.js";
import { getGitStatus as defaultGetGitStatus } from "../git/status.js";
import { REVIEWER_PROMPT } from "./prompts.js";
import type { CcReviewInput } from "./schema.js";

export interface ReviewPacketDeps {
  getGitStatus?: (cwd?: string) => Promise<string>;
  getGitDiff?: (cwd?: string) => Promise<string>;
}

export async function buildReviewPacket(
  input: CcReviewInput,
  deps: ReviewPacketDeps = {}
): Promise<string> {
  const getGitStatus = deps.getGitStatus ?? defaultGetGitStatus;
  const getGitDiff = deps.getGitDiff ?? defaultGetGitDiff;
  const cwd = input.cwd ?? process.cwd();

  const rawGitStatus = input.includeGitStatus ? await getGitStatus(cwd) : undefined;
  const rawGitDiff = input.includeGitDiff ? await getGitDiff(cwd) : undefined;
  const budgeted = prepareVariableBlocks(input, rawGitStatus, rawGitDiff);
  const instructions = [
    REVIEWER_PROMPT,
    "Act as an external reviewer.",
    "Do not edit files.",
    "Return concise, actionable findings."
  ];

  const sections = [
    "# Codex to Claude Code Review Packet",
    "## Review Instructions",
    instructions.join("\n\n"),
    "## Task Type",
    input.task,
    "## Codex Goal",
    budgeted.goal,
    "## Current Context",
    budgeted.context
  ];

  if (budgeted.gitStatus !== undefined) {
    sections.push("## Optional Git Status", fenced(budgeted.gitStatus, "text"));
  }

  if (budgeted.gitDiff !== undefined) {
    sections.push("## Optional Git Diff", fenced(budgeted.gitDiff, "diff"));
  }

  return sections.join("\n\n").trim() + "\n";
}

interface VariableBlocks {
  goal: string;
  context: string;
  gitStatus?: string;
  gitDiff?: string;
}

function prepareVariableBlocks(
  input: CcReviewInput,
  rawGitStatus: string | undefined,
  rawGitDiff: string | undefined
): VariableBlocks {
  const variableBudget = Math.max(300, input.maxContextChars - 500);
  const blocks = [
    { key: "goal", value: input.prompt ?? "Not provided.", weight: input.prompt ? 0.15 : 0.05 },
    { key: "context", value: input.context, weight: 0.45 },
    { key: "gitStatus", value: rawGitStatus, weight: rawGitStatus !== undefined ? 0.1 : 0 },
    { key: "gitDiff", value: rawGitDiff, weight: rawGitDiff !== undefined ? 0.3 : 0 }
  ] as const;
  const totalWeight = blocks.reduce((sum, block) => sum + block.weight, 0);
  const prepared: Partial<VariableBlocks> = {};

  for (const block of blocks) {
    if (block.value === undefined) continue;

    const blockBudget = Math.max(100, Math.floor((variableBudget * block.weight) / totalWeight));
    prepared[block.key] = prepareBlock(block.value, blockBudget, input.redactSecrets);
  }

  return {
    goal: prepared.goal ?? "Not provided.",
    context: prepared.context ?? "",
    gitStatus: prepared.gitStatus,
    gitDiff: prepared.gitDiff
  };
}

function prepareBlock(value: string, maxChars: number, shouldRedact: boolean): string {
  const redacted = shouldRedact ? redactSecrets(value) : value;
  return limitChars(redacted, maxChars);
}

export function redactSecrets(value: string): string {
  return value
    .replace(/\b(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}\b/g, "[REDACTED]")
    .replace(
      /\b(password|passwd|api[_-]?key|secret|token)\b\s*[:=]\s*("[^"]*"|'[^']*'|[^\s,;]+)/gi,
      "$1=[REDACTED]"
    );
}

function limitChars(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  const omitted = value.length - maxChars;
  return `${value.slice(0, maxChars)}\n\n[TRUNCATED ${omitted} chars]`;
}

function fenced(value: string, language: string): string {
  return `\`\`\`${language}\n${value}\n\`\`\``;
}
