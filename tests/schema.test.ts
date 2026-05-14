import { describe, expect, it } from "vitest";

import { CcReviewInputSchema, CcReviewOutputSchema } from "../src/review/schema.js";

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
    expect(parsed.includeGitDiff).toBe(false);
    expect(parsed.includeGitStatus).toBe(false);
    expect(parsed.autoDiscoverGit).toBeUndefined();
    expect(parsed.includeUntrackedContent).toBeUndefined();
    expect(parsed.redactSecrets).toBe(false);
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

  it("rejects removed cap fields instead of silently ignoring them", () => {
    expect(() =>
      CcReviewInputSchema.parse({
        task: "review_diff",
        context: "Review this diff.",
        maxTurns: 4
      })
    ).toThrow(/unrecognized/i);

    expect(() =>
      CcReviewInputSchema.parse({
        task: "review_diff",
        context: "Review this diff.",
        maxBudgetUsd: 2
      })
    ).toThrow(/unrecognized/i);
  });

  it("rejects unknown input keys", () => {
    expect(() =>
      CcReviewInputSchema.parse({
        task: "review_plan",
        context: "Review this plan.",
        unexpected: true
      })
    ).toThrow(/unrecognized/i);
  });

  it("normalizes comma-separated tool strings", () => {
    const parsed = CcReviewInputSchema.parse({
      task: "review_doc",
      context: "Review this document.",
      tools: "Read, Bash(git diff *)"
    });

    expect(parsed.tools).toEqual(["Read", "Bash(git diff *)"]);
  });

  it("accepts structured review context fields", () => {
    const parsed = CcReviewInputSchema.parse({
      task: "review_diff",
      context: "Review the current patch.",
      originalGoal: "Add a safer release flow.",
      reviewFocus: "Focus on staged changes.",
      codexSummary: "Updated release docs.",
      acceptanceCriteria: "Published package uses the new README.",
      knownRisks: ["GitHub Actions may lag."],
      testsRun: ["npm test: passed"],
      autoDiscoverGit: false,
      includeUntrackedContent: true
    });

    expect(parsed.originalGoal).toBe("Add a safer release flow.");
    expect(parsed.reviewFocus).toBe("Focus on staged changes.");
    expect(parsed.codexSummary).toBe("Updated release docs.");
    expect(parsed.acceptanceCriteria).toEqual(["Published package uses the new README."]);
    expect(parsed.knownRisks).toEqual(["GitHub Actions may lag."]);
    expect(parsed.testsRun).toEqual(["npm test: passed"]);
    expect(parsed.autoDiscoverGit).toBe(false);
    expect(parsed.includeUntrackedContent).toBe(true);
  });

  it("normalizes empty structured list fields to undefined", () => {
    const parsed = CcReviewInputSchema.parse({
      task: "review_plan",
      context: "Review this plan.",
      acceptanceCriteria: [],
      knownRisks: [],
      testsRun: []
    });

    expect(parsed.acceptanceCriteria).toBeUndefined();
    expect(parsed.knownRisks).toBeUndefined();
    expect(parsed.testsRun).toBeUndefined();
  });
});

describe("CcReviewOutputSchema", () => {
  it("accepts optional expanded cache usage fields", () => {
    const parsed = CcReviewOutputSchema.parse({
      ok: true,
      task: "review_diff",
      model: "opus",
      elapsedMs: 10,
      review: "No findings.",
      command: ["claude"],
      cache: {
        inputTokens: 7,
        creationInputTokens: 11,
        readInputTokens: 13,
        cacheCreation: {
          ephemeral1hInputTokens: 17,
          ephemeral5mInputTokens: 19
        },
        effective: "hit"
      }
    });

    expect(parsed.cache).toEqual({
      inputTokens: 7,
      creationInputTokens: 11,
      readInputTokens: 13,
      cacheCreation: {
        ephemeral1hInputTokens: 17,
        ephemeral5mInputTokens: 19
      },
      effective: "hit"
    });
  });
});
