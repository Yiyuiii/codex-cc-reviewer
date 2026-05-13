import { describe, expect, it } from "vitest";

import { CcReviewInputSchema } from "../src/review/schema.js";

describe("CcReviewInputSchema", () => {
  it("applies safe defaults for a minimal review request", () => {
    const parsed = CcReviewInputSchema.parse({
      task: "review_plan",
      context: "Review this implementation plan."
    });

    expect(parsed.model).toBe("sonnet");
    expect(parsed.effort).toBe("high");
    expect(parsed.output).toBe("markdown");
    expect(parsed.permissionMode).toBe("plan");
    expect(parsed.tools).toEqual(["Read"]);
    expect(parsed.maxTurns).toBe(8);
    expect(parsed.includeGitDiff).toBe(false);
    expect(parsed.includeGitStatus).toBe(false);
    expect(parsed.redactSecrets).toBe(true);
    expect(parsed.maxContextChars).toBe(120_000);
  });

  it("rejects bypass permissions because Claude is only a reviewer", () => {
    expect(() =>
      CcReviewInputSchema.parse({
        task: "review_diff",
        context: "Review this diff.",
        permissionMode: "bypassPermissions"
      })
    ).toThrow();
  });

  it("normalizes comma-separated tool strings", () => {
    const parsed = CcReviewInputSchema.parse({
      task: "review_doc",
      context: "Review this document.",
      tools: "Read, Bash(git diff *)"
    });

    expect(parsed.tools).toEqual(["Read", "Bash(git diff *)"]);
  });
});
