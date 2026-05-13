import type { CcReviewOutput } from "./schema.js";

export function formatReviewResult(result: CcReviewOutput): string {
  const sections = [result.review.trim()];
  const activity = formatActivity(result);

  if (activity) {
    sections.push(activity);
  }

  return `${sections.join("\n\n")}\n`;
}

function formatActivity(result: CcReviewOutput): string | undefined {
  if (
    !result.eventsTail?.length &&
    !result.transcriptTail?.length &&
    !result.cache &&
    result.costUsd === undefined
  ) {
    return undefined;
  }

  const lines = ["## Claude Code Activity"];

  if (result.eventCount !== undefined) {
    lines.push(`events captured: ${result.eventCount}`);
  }

  if (result.eventsTail?.length) {
    lines.push("recent events:");
    for (const event of result.eventsTail.slice(-20)) {
      lines.push(`- ${event}`);
    }
  }

  if (result.transcriptTail?.length) {
    lines.push("## Claude Code Transcript");
    for (const text of result.transcriptTail.slice(-10)) {
      lines.push(`- ${text}`);
    }
  }

  if (result.cache) {
    const cacheParts = [];
    if (result.cache.creationInputTokens !== undefined) {
      cacheParts.push(`cache creation tokens: ${result.cache.creationInputTokens}`);
    }
    if (result.cache.readInputTokens !== undefined) {
      cacheParts.push(`cache read tokens: ${result.cache.readInputTokens}`);
    }
    if (cacheParts.length) {
      lines.push(cacheParts.join(", "));
    }
  }

  if (result.costUsd !== undefined) {
    lines.push(`cost: $${result.costUsd}`);
  }

  return lines.join("\n");
}
