import { describe, expect, it } from "vitest";

import { analyzeCacheUsage } from "../src/review/cache.js";

describe("analyzeCacheUsage", () => {
  it("marks cache hits when Claude reports read tokens", () => {
    const result = analyzeCacheUsage("1h", {
      creationInputTokens: 25,
      readInputTokens: 1000
    });

    expect(result.cache).toEqual({
      creationInputTokens: 25,
      readInputTokens: 1000,
      effective: "hit"
    });
    expect(result.diagnostics).toEqual([]);
  });

  it("marks cold writes when Claude reports creation tokens without read tokens", () => {
    const result = analyzeCacheUsage("1h", {
      creationInputTokens: 1000,
      readInputTokens: 0
    });

    expect(result.cache?.effective).toBe("write");
    expect(result.diagnostics.join("\n")).toContain("cold cache write");
    expect(result.diagnostics.join("\n")).toContain("Claude Code CLI");
  });

  it("diagnoses missing or zero cache usage as unreported or below threshold", () => {
    const noUsage = analyzeCacheUsage("1h", undefined);
    const zeroUsage = analyzeCacheUsage("1h", {
      creationInputTokens: 0,
      readInputTokens: 0
    });

    expect(noUsage.cache?.effective).toBe("miss_or_unreported");
    expect(noUsage.diagnostics.join("\n")).toContain("did not report cache usage");
    expect(zeroUsage.cache?.effective).toBe("miss_or_unreported");
    expect(zeroUsage.diagnostics.join("\n")).toContain("minimum cacheable prompt length");
  });

  it("marks cache disabled when the request uses 5 minute TTL mode", () => {
    const result = analyzeCacheUsage("5m", undefined);

    expect(result.cache?.effective).toBe("disabled");
    expect(result.diagnostics.join("\n")).toContain("1-hour cache hint is disabled");
  });
});
