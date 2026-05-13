import { homedir } from "node:os";
import { join } from "node:path";

import { readTextIfExists, writeTextFile } from "../utils/fs.js";

export const CODEX_REVIEWER_SERVER_NAME = "codex_cc_reviewer";

export const CODEX_REVIEWER_CONFIG_BLOCK = `[mcp_servers.${CODEX_REVIEWER_SERVER_NAME}]
command = "npx"
args = ["-y", "codex-cc-reviewer", "serve"]
startup_timeout_sec = 20
tool_timeout_sec = 900
required = false
enabled = true
enabled_tools = ["cc_review"]`;

const REVIEWER_TABLE_PATTERN =
  /(?:^|\r?\n)\[mcp_servers\.codex_cc_reviewer\][\s\S]*?(?=\r?\n\[[^\]]+\]|\s*$)/;

export function getDefaultCodexConfigPath(home = homedir()): string {
  return join(home, ".codex", "config.toml");
}

export function installCodexReviewerConfigText(existing: string): string {
  const withoutReviewer = removeReviewerBlock(existing).trimEnd();

  if (!withoutReviewer) {
    return `${CODEX_REVIEWER_CONFIG_BLOCK}\n`;
  }

  return `${withoutReviewer}\n\n${CODEX_REVIEWER_CONFIG_BLOCK}\n`;
}

export function uninstallCodexReviewerConfigText(existing: string): string {
  const next = removeReviewerBlock(existing).trimEnd();
  return next ? `${next}\n` : "";
}

export async function installCodexReviewerConfig(configPath = getDefaultCodexConfigPath()): Promise<string> {
  const existing = await readTextIfExists(configPath);
  const next = installCodexReviewerConfigText(existing);
  await writeTextFile(configPath, next);
  return configPath;
}

export async function uninstallCodexReviewerConfig(
  configPath = getDefaultCodexConfigPath()
): Promise<string> {
  const existing = await readTextIfExists(configPath);
  const next = uninstallCodexReviewerConfigText(existing);
  await writeTextFile(configPath, next);
  return configPath;
}

export function hasCodexReviewerConfig(existing: string): boolean {
  return REVIEWER_TABLE_PATTERN.test(existing);
}

function removeReviewerBlock(existing: string): string {
  return existing
    .replace(REVIEWER_TABLE_PATTERN, (match) => (match.startsWith("\n") || match.startsWith("\r\n") ? "\n" : ""))
    .replace(/\n{3,}/g, "\n\n");
}
