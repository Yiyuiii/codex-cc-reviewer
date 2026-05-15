import { z } from "zod";

export const ReviewTaskSchema = z.enum([
  "review_plan",
  "review_diff",
  "review_doc",
  "adversarial_review"
]);

export const ReviewOutputModeSchema = z.enum(["markdown", "json"]);

export const ClaudeEffortSchema = z.enum(["low", "medium", "high", "max"]);

const REVIEW_PROFILE_DESCRIPTION =
  "Review preset. default preserves the existing broad review behavior; read_only uses read/search tools and slimmer packet routing.";
const TOOLS_DESCRIPTION =
  "Claude Code tool allowlist. Omitted runtime default is [\"default\"], or [\"Read\", \"Grep\", \"Glob\"] with reviewProfile=\"read_only\".";
const INCLUDE_UNTRACKED_CONTENT_DESCRIPTION =
  "Whether to embed selected untracked text bodies. Omitted runtime default is task-dependent, or false with reviewProfile=\"read_only\".";
const MAX_CONTEXT_CHARS_DESCRIPTION =
  "Budget for variable review packet blocks. Omitted runtime default is 120000, or 60000 with reviewProfile=\"read_only\".";

export const ReviewProfileSchema = z.enum(["default", "read_only"]);

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
}, z.array(z.string().min(1)).min(1, "tools must not be empty when provided").optional());

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

/**
 * Pre-transform MCP advertisement shape only.
 * Runtime callers must parse with CcReviewInputSchema so profile-aware defaults are applied.
 */
export const CcReviewInputBaseSchema = z.object({
  task: ReviewTaskSchema,
  reviewProfile: ReviewProfileSchema.default("default").describe(REVIEW_PROFILE_DESCRIPTION),
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
  tools: ToolsSchema.describe(TOOLS_DESCRIPTION),
  cwd: z.string().trim().min(1).optional(),
  includeGitDiff: z.boolean().default(false),
  includeGitStatus: z.boolean().default(false),
  autoDiscoverGit: z.boolean().optional(),
  includeUntrackedContent: z.boolean().optional().describe(INCLUDE_UNTRACKED_CONTENT_DESCRIPTION),
  redactSecrets: z.boolean().default(false),
  maxContextChars: z
    .number()
    .int()
    .min(1_000)
    .max(1_000_000)
    .optional()
    .describe(MAX_CONTEXT_CHARS_DESCRIPTION),
  stream: z.boolean().default(true),
  includePartialMessages: z.boolean().default(true),
  includeHookEvents: z.boolean().default(true),
  verbose: z.boolean().default(true),
  cacheTtl: CacheTtlSchema.default("1h")
}).strict();

export const CcReviewInputSchema = CcReviewInputBaseSchema.transform((input) => {
  const readOnly = input.reviewProfile === "read_only";
  const tools = input.tools ?? (readOnly ? ["Read", "Grep", "Glob"] : ["default"]);

  return {
    ...input,
    tools,
    includeUntrackedContent:
      input.includeUntrackedContent ?? (readOnly ? false : undefined),
    maxContextChars: input.maxContextChars ?? (readOnly ? 60_000 : 120_000)
  };
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
      inputTokens: z.number().int().nonnegative().optional(),
      creationInputTokens: z.number().int().nonnegative().optional(),
      readInputTokens: z.number().int().nonnegative().optional(),
      cacheCreation: z
        .object({
          ephemeral1hInputTokens: z.number().int().nonnegative().optional(),
          ephemeral5mInputTokens: z.number().int().nonnegative().optional()
        })
        .optional(),
      effective: z.enum(["hit", "write", "miss_or_unreported", "disabled"]).optional()
    })
    .optional(),
  costUsd: z.number().nonnegative().optional(),
  activityTail: z.array(ActivityEventSchema).optional(),
  diagnostics: z.array(z.string()).optional(),
  stderrTail: z.string().optional(),
  exitCode: z.number().int().optional()
});

export type CcReviewInput = z.output<typeof CcReviewInputSchema>;
export type CcReviewOutput = z.infer<typeof CcReviewOutputSchema>;
