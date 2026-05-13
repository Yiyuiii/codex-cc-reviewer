import { runClaudeReview } from "../runner/claude.js";
import { formatReviewResult } from "../review/format.js";
import { CcReviewInputSchema, type CcReviewInput, type CcReviewOutput } from "../review/schema.js";

export interface LocalReviewOptions {
  task?: string;
  context?: string;
  prompt?: string;
  originalGoal?: string;
  reviewFocus?: string;
  codexSummary?: string;
  acceptanceCriteria?: string | string[];
  knownRisks?: string | string[];
  testsRun?: string | string[];
  model?: string;
  effort?: string;
  output?: string;
  permissionMode?: string;
  tools?: string;
  maxTurns?: string | number;
  maxBudgetUsd?: string | number;
  cwd?: string;
  includeGitDiff?: boolean;
  includeGitStatus?: boolean;
  autoDiscoverGit?: boolean;
  stream?: boolean;
  includePartialMessages?: boolean;
  includeHookEvents?: boolean;
  verbose?: boolean;
  cacheTtl?: string;
}

export interface LocalReviewDeps {
  runReview?: (input: CcReviewInput) => Promise<CcReviewOutput>;
  write?: (text: string) => void;
}

export async function runLocalReview(
  options: LocalReviewOptions,
  deps: LocalReviewDeps = {}
): Promise<CcReviewOutput> {
  const input = CcReviewInputSchema.parse({
    ...options,
    maxTurns: coerceOptionalNumber(options.maxTurns),
    maxBudgetUsd: coerceOptionalNumber(options.maxBudgetUsd)
  });
  const runReview = deps.runReview ?? runClaudeReview;
  const write = deps.write ?? ((text: string) => process.stdout.write(text));
  const result = await runReview(input);

  write(formatReviewResult(result));

  if (!result.ok) {
    process.exitCode = 1;
  }

  return result;
}

function coerceOptionalNumber(value: string | number | undefined): number | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }

  if (typeof value === "number") {
    return value;
  }

  return Number(value);
}
