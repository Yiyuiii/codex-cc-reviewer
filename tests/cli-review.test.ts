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
        includeGitDiff: true,
        maxTurns: "4"
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
    expect(observed?.maxTurns).toBe(4);
    expect(writes.join("")).toContain("Looks reasonable.");
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
