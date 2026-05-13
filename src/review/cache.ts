import type { CcReviewInput } from "./schema.js";

export type CacheEffective = "hit" | "write" | "miss_or_unreported" | "disabled";

export interface CacheUsage {
  creationInputTokens?: number;
  readInputTokens?: number;
  effective?: CacheEffective;
}

export interface CacheAnalysis {
  cache?: CacheUsage;
  diagnostics: string[];
}

export function parseCacheUsage(usage: unknown): Omit<CacheUsage, "effective"> | undefined {
  if (!usage || typeof usage !== "object") {
    return undefined;
  }

  const record = usage as Record<string, unknown>;
  const creationInputTokens =
    typeof record.cache_creation_input_tokens === "number"
      ? record.cache_creation_input_tokens
      : undefined;
  const readInputTokens =
    typeof record.cache_read_input_tokens === "number" ? record.cache_read_input_tokens : undefined;

  if (creationInputTokens === undefined && readInputTokens === undefined) {
    return undefined;
  }

  return {
    creationInputTokens,
    readInputTokens
  };
}

export function analyzeCacheUsage(
  cacheTtl: CcReviewInput["cacheTtl"],
  cache: Omit<CacheUsage, "effective"> | undefined
): CacheAnalysis {
  if (cacheTtl !== "1h") {
    return {
      cache: { ...cache, effective: "disabled" },
      diagnostics: ["1-hour cache hint is disabled for this review request."]
    };
  }

  if (!cache) {
    return {
      cache: { effective: "miss_or_unreported" },
      diagnostics: [
        "Claude Code CLI did not report cache usage; cache status is unknown for this run."
      ]
    };
  }

  const creationInputTokens = cache.creationInputTokens ?? 0;
  const readInputTokens = cache.readInputTokens ?? 0;

  if (readInputTokens > 0) {
    return {
      cache: { ...cache, effective: "hit" },
      diagnostics: []
    };
  }

  if (creationInputTokens > 0) {
    return {
      cache: { ...cache, effective: "write" },
      diagnostics: [
        "Claude Code CLI reported a cold cache write without cache reads; a repeated compatible request within the TTL should be cheaper."
      ]
    };
  }

  return {
    cache: { ...cache, effective: "miss_or_unreported" },
    diagnostics: [
      "Claude Code CLI reported zero cache tokens; the prompt may be below the minimum cacheable prompt length, the stable prefix may not match, or cache usage may be unreported."
    ]
  };
}
