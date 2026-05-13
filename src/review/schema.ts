import { z } from "zod";

export const ReviewTaskSchema = z.enum([
  "review_plan",
  "review_diff",
  "review_doc",
  "adversarial_review"
]);

export const ReviewOutputModeSchema = z.enum(["markdown", "json"]);

export const ClaudeEffortSchema = z.enum(["low", "medium", "high", "xhigh", "max"]);

export const ClaudePermissionModeSchema = z.enum(["default", "plan", "dontAsk"]);

const ToolsSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}, z.array(z.string().min(1)).default(["Read"]));

export const CcReviewInputSchema = z.object({
  task: ReviewTaskSchema,
  prompt: z.string().trim().min(1).optional(),
  context: z.string().min(1),
  model: z.string().trim().min(1).default("sonnet"),
  effort: ClaudeEffortSchema.default("high"),
  output: ReviewOutputModeSchema.default("markdown"),
  permissionMode: ClaudePermissionModeSchema.default("plan"),
  tools: ToolsSchema,
  maxTurns: z.number().int().min(1).max(30).default(8),
  maxBudgetUsd: z.number().positive().max(20).optional(),
  cwd: z.string().trim().min(1).optional(),
  includeGitDiff: z.boolean().default(false),
  includeGitStatus: z.boolean().default(false),
  redactSecrets: z.boolean().default(true),
  maxContextChars: z.number().int().min(1_000).max(1_000_000).default(120_000)
});

export const CcReviewOutputSchema = z.object({
  ok: z.boolean(),
  task: ReviewTaskSchema,
  model: z.string(),
  elapsedMs: z.number().int().nonnegative(),
  review: z.string(),
  structured: z.unknown().optional(),
  command: z.array(z.string()),
  stderrTail: z.string().optional(),
  exitCode: z.number().int().optional()
});

export type CcReviewInput = z.infer<typeof CcReviewInputSchema>;
export type CcReviewOutput = z.infer<typeof CcReviewOutputSchema>;
