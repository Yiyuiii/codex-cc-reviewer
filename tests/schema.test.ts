import { describe, expect, it } from "vitest";

import { CcReviewInputSchema } from "../src/review/schema.js";

describe("CcReviewInputSchema", () => {
  it("applies deep autonomous defaults for a minimal review request", () => {
    const parsed = CcReviewInputSchema.parse({
      task: "review_plan",
      context: "Review this implementation plan."
    });

    expect(parsed.model).toBe("opus");
    expect(parsed.effort).toBe("max");
    expect(parsed.output).toBe("markdown");
    expect(parsed.permissionMode).toBe("bypassPermissions");
    expect(parsed.tools).toEqual(["default"]);
    expect(parsed.maxTurns).toBe(8);
    expect(parsed.includeGitDiff).toBe(false);
    expect(parsed.includeGitStatus).toBe(false);
    expect(parsed.redactSecrets).toBe(true);
    expect(parsed.maxContextChars).toBe(120_000);
    expect(parsed.stream).toBe(true);
    expect(parsed.includePartialMessages).toBe(true);
    expect(parsed.includeHookEvents).toBe(true);
    expect(parsed.verbose).toBe(true);
    expect(parsed.cacheTtl).toBe("1h");
  });

  it("rejects unsupported effort levels", () => {
    expect(() =>
      CcReviewInputSchema.parse({
        task: "review_diff",
        context: "Review this diff.",
        effort: "xhigh"
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
