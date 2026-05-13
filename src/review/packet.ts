import { getGitDiff as defaultGetGitDiff } from "../git/diff.js";
import { getGitStatus as defaultGetGitStatus } from "../git/status.js";
import { JSON_OUTPUT_PROMPT, REVIEWER_PROMPT } from "./prompts.js";
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

  const context = prepareBlock(input.context, input);
  const goal = prepareBlock(input.prompt ?? "Not provided.", input);
  const sections = [
    "# Codex to Claude Code Review Packet",
    "## Task Type",
    input.task,
    "## Codex Goal",
    goal,
    "## Current Context",
    context
  ];

  if (input.includeGitStatus) {
    const status = prepareBlock(await getGitStatus(cwd), input);
    sections.push("## Optional Git Status", fenced(status, "text"));
  }

  if (input.includeGitDiff) {
    const diff = prepareBlock(await getGitDiff(cwd), input);
    sections.push("## Optional Git Diff", fenced(diff, "diff"));
  }

  const instructions = [
    REVIEWER_PROMPT,
    "Act as an external reviewer.",
    "Do not edit files.",
    "Return concise, actionable findings."
  ];

  if (input.output === "json") {
    instructions.push(JSON_OUTPUT_PROMPT);
  }

  sections.push("## Review Instructions", instructions.join("\n\n"));

  return sections.join("\n\n").trim() + "\n";
}

function prepareBlock(value: string, input: CcReviewInput): string {
  const redacted = input.redactSecrets ? redactSecrets(value) : value;
  const blockBudget = Math.max(200, input.maxContextChars - 300);
  return limitChars(redacted, blockBudget);
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
