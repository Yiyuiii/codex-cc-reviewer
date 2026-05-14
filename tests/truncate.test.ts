import { describe, expect, it } from "vitest";

import { truncateMiddle } from "../src/utils/truncate.js";

describe("truncateMiddle", () => {
  it("returns strings at or below the limit unchanged", () => {
    expect(truncateMiddle("short", 5)).toBe("short");
    expect(truncateMiddle("short", 10)).toBe("short");
  });

  it("preserves head and tail evidence for oversized strings", () => {
    const value = [
      "HEAD-IMPORTANT",
      ...Array.from({ length: 80 }, (_, index) => `middle-${index}`),
      "TAIL-IMPORTANT"
    ].join("\n");
    const truncated = truncateMiddle(value, 160);

    expect(truncated).toContain("HEAD-IMPORTANT");
    expect(truncated).toContain("TAIL-IMPORTANT");
    expect(truncated).toContain("[TRUNCATED");
    expect(truncated).not.toContain("middle-40");
  });

  it("handles empty strings", () => {
    expect(truncateMiddle("", 0)).toBe("");
    expect(truncateMiddle("", 10)).toBe("");
  });

  it("documents minimum-budget behavior for tiny limits", () => {
    const truncated = truncateMiddle("abcdef", 2);

    expect(truncated).toContain("[TRUNCATED");
    expect(truncated).toContain("from middle");
  });
});
