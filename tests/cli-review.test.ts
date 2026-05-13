import { describe, expect, it } from "vitest";

import { runLocalReview } from "../src/cli/review.js";
import type { CcReviewInput, CcReviewOutput } from "../src/review/schema.js";

describe("runLocalReview", () => {
  it("maps CLI options into cc_review input and writes the review text", async () => {
    let observed: CcReviewInput | undefined;
    const writes: string[] = [];

    const result = await runLocalReview(
      {
        task: "review_diff",
        context: "Review my staged change.",
        tools: "Read, Bash(git diff *)",
        includeGitDiff: true
      },
      {
        runReview: async (input) => {
          observed = input;
          return reviewOutput(input, "Looks reasonable.");
        },
        write: (text) => writes.push(text)
      }
    );

    expect(result.ok).toBe(true);
    expect(observed?.task).toBe("review_diff");
    expect(observed?.tools).toEqual(["Read", "Bash(git diff *)"]);
    expect(observed?.includeGitDiff).toBe(true);
    expect(writes.join("")).toContain("Looks reasonable.");
  });

  it("rejects removed cap options before running a review", async () => {
    let reachedRunner = false;

    await expect(
      runLocalReview(
        {
          task: "review_doc",
          context: "Review this doc.",
          maxTurns: "4"
        } as unknown as Parameters<typeof runLocalReview>[0],
        {
          runReview: async (input) => {
            reachedRunner = true;
            return reviewOutput(input, "OK.");
          },
          write: () => undefined
        }
      )
    ).rejects.toThrow(/unrecognized/i);

    expect(reachedRunner).toBe(false);
  });
});

function reviewOutput(input: CcReviewInput, review: string): CcReviewOutput {
  return {
    ok: true,
    task: input.task,
    model: input.model,
    elapsedMs: 10,
    review,
    command: ["claude"]
  };
}
