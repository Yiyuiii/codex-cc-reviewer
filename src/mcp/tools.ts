import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { runClaudeReview } from "../runner/claude.js";
import { CcReviewInputSchema, CcReviewOutputSchema } from "../review/schema.js";

export function registerCcReviewTool(server: McpServer): void {
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
    async (input) => {
      const parsed = CcReviewInputSchema.parse(input);
      const result = await runClaudeReview(parsed);

      return {
        content: [
          {
            type: "text",
            text: result.review
          }
        ],
        structuredContent: result
      };
    }
  );
}

