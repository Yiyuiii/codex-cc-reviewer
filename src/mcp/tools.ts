import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { RunClaudeReviewDeps } from "../runner/claude.js";
import { runClaudeReview } from "../runner/claude.js";
import { formatReviewResult } from "../review/format.js";
import { CcReviewInputSchema, CcReviewOutputSchema } from "../review/schema.js";
import { createProgressReporter } from "./progress.js";

export interface RegisterCcReviewToolDeps {
  runReview?: (input: ReturnType<typeof CcReviewInputSchema.parse>, deps?: RunClaudeReviewDeps) => ReturnType<typeof runClaudeReview>;
}

export function registerCcReviewTool(
  server: McpServer,
  deps: RegisterCcReviewToolDeps = {}
): void {
  const runReview = deps.runReview ?? runClaudeReview;

  server.registerTool(
    "cc_review",
    {
      title: "Claude Code Review",
      description:
        "Run Claude Code as an external reviewer for Codex plans, diffs, or documents.",
      inputSchema: CcReviewInputSchema.shape,
      outputSchema: CcReviewOutputSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (input, extra) => {
      const parsed = CcReviewInputSchema.parse(input);
      const progress = createProgressReporter(extra);
      let progressFinished = false;
      const finishProgress = async () => {
        if (!progressFinished) {
          progressFinished = true;
          await progress.finish();
        }
      };

      try {
        const result = await runReview(parsed, {
          onActivity: progress.onActivity,
          signal: extra.signal
        });
        await finishProgress();
        const diagnostics = [
          ...(result.diagnostics ?? []),
          ...progress.getDiagnostics()
        ];
        const output = diagnostics.length ? { ...result, diagnostics } : result;

        return {
          content: [
            {
              type: "text",
              text: formatReviewResult(output)
            }
          ],
          structuredContent: output
        };
      } finally {
        await finishProgress();
      }
    }
  );
}
