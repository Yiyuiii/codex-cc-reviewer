import { homedir } from "node:os";
import { join } from "node:path";

import { readTextIfExists, writeTextFile } from "../utils/fs.js";

export const CODEX_REVIEWER_SERVER_NAME = "codex_cc_reviewer";
export const DEFAULT_CODEX_REVIEWER_PACKAGE_SPEC = "codex-cc-reviewer";

export interface InstallCodexReviewerConfigOptions {
  packageSpec?: string;
}

// Convenience alias for the default MCP config block; parameterized installs use the builder directly.
export const CODEX_REVIEWER_CONFIG_BLOCK = buildCodexReviewerConfigBlock();

const REVIEWER_TABLE_PATTERN =
  /(?:^|\r?\n)\[mcp_servers\.codex_cc_reviewer\][\s\S]*?(?=\r?\n\[[^\]]+\]|\s*$)/;

export function buildCodexReviewerConfigBlock(
  options: InstallCodexReviewerConfigOptions = {}
): string {
  const packageSpec = normalizePackageSpec(options.packageSpec);
  return `[mcp_servers.${CODEX_REVIEWER_SERVER_NAME}]
command = "npx"
args = ["-y", ${tomlString(packageSpec)}, "serve"]
startup_timeout_sec = 20
tool_timeout_sec = 900
required = false
enabled = true
enabled_tools = ["cc_review"]`;
}

export function getDefaultCodexConfigPath(home = homedir()): string {
  return join(home, ".codex", "config.toml");
}

export function installCodexReviewerConfigText(
  existing: string,
  options: InstallCodexReviewerConfigOptions = {}
): string {
  const withoutReviewer = removeReviewerBlock(existing).trimEnd();
  const reviewerBlock = buildCodexReviewerConfigBlock(options);

  if (!withoutReviewer) {
    return `${reviewerBlock}\n`;
  }

  return `${withoutReviewer}\n\n${reviewerBlock}\n`;
}

export function uninstallCodexReviewerConfigText(existing: string): string {
  const next = removeReviewerBlock(existing).trimEnd();
  return next ? `${next}\n` : "";
}

export async function installCodexReviewerConfig(
  configPath = getDefaultCodexConfigPath(),
  options: InstallCodexReviewerConfigOptions = {}
): Promise<string> {
  const existing = await readTextIfExists(configPath);
  const next = installCodexReviewerConfigText(existing, options);
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

export function getConfiguredCodexReviewerPackageSpec(existing: string): string | undefined {
  const block = existing.match(REVIEWER_TABLE_PATTERN)?.[0];
  if (!block) return undefined;

  const argsLine = block.match(/^\s*args\s*=\s*\[(.*)\]\s*$/m)?.[1];
  if (!argsLine) return undefined;

  const args = parseTomlStringArray(argsLine);
  const packageSpec = args[1];
  if (args[0] !== "-y" || args[2] !== "serve" || !packageSpec) return undefined;
  return packageSpec;
}

export function normalizePackageSpec(packageSpec = DEFAULT_CODEX_REVIEWER_PACKAGE_SPEC): string {
  const normalized = packageSpec.trim();
  if (!/^codex-cc-reviewer(?:@[^\s"\\]+)?$/.test(normalized)) {
    throw new Error(
      `Invalid codex-cc-reviewer package spec: ${packageSpec || "(empty)"}`
    );
  }
  return normalized;
}

function removeReviewerBlock(existing: string): string {
  return existing
    .replace(REVIEWER_TABLE_PATTERN, (match) => (match.startsWith("\n") || match.startsWith("\r\n") ? "\n" : ""))
    .replace(/\n{3,}/g, "\n\n");
}

function tomlString(value: string): string {
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error("TOML basic strings cannot contain control characters");
  }
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function parseTomlStringArray(value: string): string[] {
  const result: string[] = [];
  const pattern = /"((?:\\.|[^"\\])*)"\s*(?:,|$)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value)) !== null) {
    result.push(unescapeTomlBasicString(match[1] ?? ""));
  }
  return result;
}

function unescapeTomlBasicString(value: string): string {
  return value.replace(/\\(["\\])/g, "$1");
}
