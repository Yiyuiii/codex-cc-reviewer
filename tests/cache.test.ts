import { describe, expect, it } from "vitest";

import { analyzeCacheUsage, parseCacheUsage } from "../src/review/cache.js";

describe("parseCacheUsage", () => {
  it("parses uncached input tokens and cache creation TTL buckets", () => {
    expect(parseCacheUsage({
      input_tokens: 7,
      cache_creation_input_tokens: 11,
      cache_read_input_tokens: 13,
      cache_creation: {
        ephemeral_1h_input_tokens: 17,
        ephemeral_5m_input_tokens: 19
      }
    })).toEqual({
      inputTokens: 7,
      creationInputTokens: 11,
      readInputTokens: 13,
      cacheCreation: {
        ephemeral1hInputTokens: 17,
        ephemeral5mInputTokens: 19
      }
    });
  });

  it("keeps input-only and bucket-only usage instead of dropping it", () => {
    expect(parseCacheUsage({ input_tokens: 7 })).toEqual({
      inputTokens: 7
    });

    expect(parseCacheUsage({
      cache_creation: {
        ephemeral_1h_input_tokens: 17
      }
    })).toEqual({
      cacheCreation: {
        ephemeral1hInputTokens: 17
      }
    });
  });

  it("ignores malformed cache creation bucket values without coercion", () => {
    expect(parseCacheUsage({ cache_creation: null })).toBeUndefined();
    expect(parseCacheUsage({ cache_creation: 7 })).toBeUndefined();
    expect(parseCacheUsage({ cache_creation: [17] })).toBeUndefined();
    expect(parseCacheUsage({
      cache_creation: {
        ephemeral_1h_input_tokens: "17",
        ephemeral_5m_input_tokens: 19
      }
    })).toEqual({
      cacheCreation: {
        ephemeral5mInputTokens: 19
      }
    });
  });
});

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

  it("marks bucket-only cache creation as a write", () => {
    const result = analyzeCacheUsage("1h", {
      cacheCreation: {
        ephemeral1hInputTokens: 1000
      }
    });

    expect(result.cache?.effective).toBe("write");
    expect(result.diagnostics.join("\n")).toContain("cold cache write");
  });

  it("diagnoses mismatched aggregate and TTL bucket cache creation tokens", () => {
    const result = analyzeCacheUsage("1h", {
      creationInputTokens: 100,
      cacheCreation: {
        ephemeral1hInputTokens: 75,
        ephemeral5mInputTokens: 5
      }
    });

    expect(result.cache?.effective).toBe("write");
    expect(result.diagnostics.join("\n")).toContain("aggregate (100)");
    expect(result.diagnostics.join("\n")).toContain("TTL bucket sum (80)");
  });

  it("uses bucket cache creation when the aggregate field is zero", () => {
    const result = analyzeCacheUsage("1h", {
      creationInputTokens: 0,
      cacheCreation: {
        ephemeral1hInputTokens: 1000
      }
    });

    expect(result.cache?.effective).toBe("write");
    expect(result.diagnostics.join("\n")).toContain("cold cache write");
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
    const result = analyzeCacheUsage("5m", {
      inputTokens: 3,
      cacheCreation: {
        ephemeral5mInputTokens: 1000
      }
    });

    expect(result.cache?.effective).toBe("disabled");
    expect(result.cache?.inputTokens).toBe(3);
    expect(result.cache?.cacheCreation?.ephemeral5mInputTokens).toBe(1000);
    expect(result.diagnostics.join("\n")).toContain("1-hour cache hint is disabled");
    expect(result.diagnostics.join("\n")).toContain("still reported cache token activity");
    expect(result.diagnostics.join("\n")).toContain("inputTokens=3");
    expect(result.diagnostics.join("\n")).toContain("ephemeral5mInputTokens=1000");
  });
});
