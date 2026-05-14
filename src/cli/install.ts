import { installCodexReviewerConfig, normalizePackageSpec } from "../config/codex.js";
import { writeLine } from "../utils/logger.js";

export interface InstallCliOptions {
  packageSpec?: string;
}

export async function installCodexConfig(options: InstallCliOptions = {}): Promise<void> {
  const packageSpec = normalizePackageSpec(options.packageSpec);
  const configPath = await installCodexReviewerConfig(undefined, {
    packageSpec
  });
  writeLine(`Installed codex-cc-reviewer MCP config at ${configPath}`);
  writeLine(`MCP package spec: ${packageSpec}`);
}

