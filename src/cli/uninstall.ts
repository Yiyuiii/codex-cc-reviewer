import { uninstallCodexReviewerConfig } from "../config/codex.js";
import { writeLine } from "../utils/logger.js";

export async function uninstallCodexConfig(): Promise<void> {
  const configPath = await uninstallCodexReviewerConfig();
  writeLine(`Removed codex-cc-reviewer MCP config from ${configPath}`);
}

