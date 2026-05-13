import { installCodexReviewerConfig } from "../config/codex.js";
import { writeLine } from "../utils/logger.js";

export async function installCodexConfig(): Promise<void> {
  const configPath = await installCodexReviewerConfig();
  writeLine(`Installed codex-cc-reviewer MCP config at ${configPath}`);
}

