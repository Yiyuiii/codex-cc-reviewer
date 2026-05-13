import { z } from "zod";

export const ReviewTaskSchema = z.enum([
  "review_plan",
  "review_diff",
  "review_doc",
  "adversarial_review"
]);

export const ReviewOutputModeSchema = z.enum(["markdown", "json"]);

export const ClaudeEffortSchema = z.enum(["low", "medium", "high", "max"]);

export const ClaudePermissionModeSchema = z.enum([
  "acceptEdits",
  "auto",
  "bypassPermissions",
  "default",
  "dontAsk",
  "plan"
]);

export const CacheTtlSchema = z.enum(["5m", "1h"]);

const ActivityEventSchema = z.object({
  index: z.number().int().positive(),
  kind: z.enum([
    "system",
    "assistant_text",
    "user_text",
    "text_delta",
    "tool_use",
    "tool_result",
    "hook",
    "message_delta",
    "result",
    "stderr",
    "unknown"
  ]),
  rawType: z.string(),
  summary: z.string(),
  text: z.string().optional(),
  toolName: z.string().optional(),
  toolInput: z.unknown().optional(),
  toolInputPreview: z.string().optional(),
  toolInputTruncated: z.boolean().optional()
});

const ToolsSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}, z.array(z.string().min(1)).default(["default"]));

const NonEmptyStringSchema = z.string().trim().min(1);

const StringListSchema = z.preprocess((value) => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : undefined;
  }

  return value;
}, z.array(NonEmptyStringSchema).optional()).transform((value) =>
  value?.length ? value : undefined
).optional();

export const CcReviewInputSchema = z.object({
  task: ReviewTaskSchema,
  prompt: NonEmptyStringSchema.optional(),
  originalGoal: NonEmptyStringSchema.optional(),
  reviewFocus: NonEmptyStringSchema.optional(),
  codexSummary: NonEmptyStringSchema.optional(),
  acceptanceCriteria: StringListSchema,
  knownRisks: StringListSchema,
  testsRun: StringListSchema,
  context: z.string().min(1),
  model: z.string().trim().min(1).default("opus"),
  effort: ClaudeEffortSchema.default("max"),
  output: ReviewOutputModeSchema.default("markdown"),
  permissionMode: ClaudePermissionModeSchema.default("bypassPermissions"),
  tools: ToolsSchema,
  maxTurns: z.number().int().min(1).max(30).optional(),
  maxBudgetUsd: z.number().positive().max(20).optional(),
  cwd: z.string().trim().min(1).optional(),
  includeGitDiff: z.boolean().default(false),
  includeGitStatus: z.boolean().default(false),
  autoDiscoverGit: z.boolean().optional(),
  redactSecrets: z.boolean().default(false),
  maxContextChars: z.number().int().min(1_000).max(1_000_000).default(120_000),
  stream: z.boolean().default(true),
  includePartialMessages: z.boolean().default(true),
  includeHookEvents: z.boolean().default(true),
  verbose: z.boolean().default(true),
  cacheTtl: CacheTtlSchema.default("1h")
});

export const CcReviewOutputSchema = z.object({
  ok: z.boolean(),
  task: ReviewTaskSchema,
  model: z.string(),
  elapsedMs: z.number().int().nonnegative(),
  review: z.string(),
  structured: z.unknown().optional(),
  command: z.array(z.string()),
  eventsTail: z.array(z.string()).optional(),
  transcriptTail: z.array(z.string()).optional(),
  eventCount: z.number().int().nonnegative().optional(),
  cache: z
    .object({
      creationInputTokens: z.number().int().nonnegative().optional(),
      readInputTokens: z.number().int().nonnegative().optional(),
      effective: z.enum(["hit", "write", "miss_or_unreported", "disabled"]).optional()
    })
    .optional(),
  costUsd: z.number().nonnegative().optional(),
  activityTail: z.array(ActivityEventSchema).optional(),
  diagnostics: z.array(z.string()).optional(),
  stderrTail: z.string().optional(),
  exitCode: z.number().int().optional()
});

export type CcReviewInput = z.infer<typeof CcReviewInputSchema>;
export type CcReviewOutput = z.infer<typeof CcReviewOutputSchema>;
