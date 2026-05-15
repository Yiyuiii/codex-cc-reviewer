import { describe, expect, it } from "vitest";

import { runLocalPreview } from "../src/cli/preview.js";
import type { CcReviewInput } from "../src/review/schema.js";

describe("runLocalPreview", () => {
  it("maps CLI options into packet input and writes only the generated packet", async () => {
    let observed: CcReviewInput | undefined;
    const writes: string[] = [];

    const packet = await runLocalPreview(
      {
        task: "review_diff",
        reviewProfile: "read_only",
        context: "Preview this change.",
        includeGitDiff: true,
        includeUntrackedContent: false,
        redactSecrets: true,
        maxContextChars: "5000"
      },
      {
        buildPacket: async (input) => {
          observed = input;
          return "# packet\n";
        },
        write: (text) => writes.push(text)
      }
    );

    expect(packet).toBe("# packet\n");
    expect(observed).toMatchObject({
      task: "review_diff",
      reviewProfile: "read_only",
      tools: ["Read", "Grep", "Glob"],
      includeGitDiff: true,
      includeUntrackedContent: false,
      redactSecrets: true,
      maxContextChars: 5_000
    });
    expect(writes).toEqual(["# packet\n"]);
  });

  it("rejects Claude runner options before building a preview packet", async () => {
    let reachedBuilder = false;

    await expect(
      runLocalPreview(
        {
          task: "review_diff",
          context: "Preview this change.",
          maxTurns: "4"
        } as unknown as Parameters<typeof runLocalPreview>[0],
        {
          buildPacket: async () => {
            reachedBuilder = true;
            return "# packet\n";
          },
          write: () => undefined
        }
      )
    ).rejects.toThrow(/unrecognized/i);

    expect(reachedBuilder).toBe(false);
  });
});
