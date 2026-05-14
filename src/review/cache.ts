import type { CcReviewInput } from "./schema.js";

export type CacheEffective = "hit" | "write" | "miss_or_unreported" | "disabled";

export interface CacheUsage {
  inputTokens?: number;
  creationInputTokens?: number;
  readInputTokens?: number;
  cacheCreation?: {
    ephemeral1hInputTokens?: number;
    ephemeral5mInputTokens?: number;
  };
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
  const inputTokens =
    typeof record.input_tokens === "number" ? record.input_tokens : undefined;
  const creationInputTokens =
    typeof record.cache_creation_input_tokens === "number"
      ? record.cache_creation_input_tokens
      : undefined;
  const readInputTokens =
    typeof record.cache_read_input_tokens === "number" ? record.cache_read_input_tokens : undefined;
  const cacheCreationRecord =
    record.cache_creation && typeof record.cache_creation === "object" && !Array.isArray(record.cache_creation)
      ? record.cache_creation as Record<string, unknown>
      : undefined;
  const ephemeral1hInputTokens =
    typeof cacheCreationRecord?.ephemeral_1h_input_tokens === "number"
      ? cacheCreationRecord.ephemeral_1h_input_tokens
      : undefined;
  const ephemeral5mInputTokens =
    typeof cacheCreationRecord?.ephemeral_5m_input_tokens === "number"
      ? cacheCreationRecord.ephemeral_5m_input_tokens
      : undefined;
  const cacheCreation =
    ephemeral1hInputTokens !== undefined || ephemeral5mInputTokens !== undefined
      ? {
          ...(ephemeral1hInputTokens !== undefined ? { ephemeral1hInputTokens } : {}),
          ...(ephemeral5mInputTokens !== undefined ? { ephemeral5mInputTokens } : {})
        }
      : undefined;

  if (
    inputTokens === undefined &&
    creationInputTokens === undefined &&
    readInputTokens === undefined &&
    cacheCreation === undefined
  ) {
    return undefined;
  }

  return {
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(creationInputTokens !== undefined ? { creationInputTokens } : {}),
    ...(readInputTokens !== undefined ? { readInputTokens } : {}),
    ...(cacheCreation !== undefined ? { cacheCreation } : {})
  };
}

export function analyzeCacheUsage(
  cacheTtl: CcReviewInput["cacheTtl"],
  cache: Omit<CacheUsage, "effective"> | undefined
): CacheAnalysis {
  if (cacheTtl !== "1h") {
    const diagnostics = ["1-hour cache hint is disabled for this review request."];
    const cacheActivityDetails = formatNonZeroCacheFields(cache);
    if (cacheActivityDetails.length) {
      diagnostics.push(
        `Claude Code still reported cache token activity (${cacheActivityDetails.join(", ")}); inspect the raw cache fields before treating this as no-cache.`
      );
    }

    return {
      cache: { ...cache, effective: "disabled" },
      diagnostics
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

  const readInputTokens = cache.readInputTokens ?? 0;
  const bucketCreationInputTokens =
    (cache.cacheCreation?.ephemeral1hInputTokens ?? 0) +
    (cache.cacheCreation?.ephemeral5mInputTokens ?? 0);
  const aggregateCreationInputTokens =
    Math.max(cache.creationInputTokens ?? 0, bucketCreationInputTokens);
  const mismatchDiagnostics =
    cache.creationInputTokens !== undefined &&
    cache.creationInputTokens > 0 &&
    bucketCreationInputTokens > 0 &&
    cache.creationInputTokens !== bucketCreationInputTokens
      ? [
          `Claude Code reported cache creation aggregate (${cache.creationInputTokens}) that disagrees with TTL bucket sum (${bucketCreationInputTokens}); cache report may be partial.`
        ]
      : [];

  if (readInputTokens > 0) {
    return {
      cache: { ...cache, effective: "hit" },
      diagnostics: mismatchDiagnostics
    };
  }

  if (aggregateCreationInputTokens > 0) {
    return {
      cache: { ...cache, effective: "write" },
      diagnostics: [
        ...mismatchDiagnostics,
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

function formatNonZeroCacheFields(cache: Omit<CacheUsage, "effective"> | undefined): string[] {
  if (!cache) {
    return [];
  }

  const fields: string[] = [];
  if ((cache.inputTokens ?? 0) > 0) fields.push(`inputTokens=${cache.inputTokens}`);
  if ((cache.creationInputTokens ?? 0) > 0) fields.push(`creationInputTokens=${cache.creationInputTokens}`);
  if ((cache.readInputTokens ?? 0) > 0) fields.push(`readInputTokens=${cache.readInputTokens}`);
  if ((cache.cacheCreation?.ephemeral1hInputTokens ?? 0) > 0) {
    fields.push(`ephemeral1hInputTokens=${cache.cacheCreation?.ephemeral1hInputTokens}`);
  }
  if ((cache.cacheCreation?.ephemeral5mInputTokens ?? 0) > 0) {
    fields.push(`ephemeral5mInputTokens=${cache.cacheCreation?.ephemeral5mInputTokens}`);
  }

  return fields;
}
