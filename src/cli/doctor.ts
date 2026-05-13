import { readTextIfExists } from "../utils/fs.js";
import { runCommandCheck } from "../utils/exec.js";
import { writeLine } from "../utils/logger.js";
import { getDefaultCodexConfigPath, hasCodexReviewerConfig } from "../config/codex.js";

export interface DoctorResult {
  name: string;
  ok: boolean;
  detail: string;
}

export async function collectDoctorResults(): Promise<DoctorResult[]> {
  const [node, npm, codex, claude] = await Promise.all([
    runCommandCheck("node", ["--version"]),
    runCommandCheck("npm", ["--version"]),
    runCommandCheck("codex", ["--version"]),
    runCommandCheck("claude", ["--version"])
  ]);
  const configPath = getDefaultCodexConfigPath();
  const configText = await readTextIfExists(configPath);

  return [
    commandResult("Node", node),
    commandResult("npm", npm),
    commandResult("Codex CLI", codex),
    commandResult("Claude Code CLI", claude),
    {
      name: "Codex config",
      ok: configText.length > 0,
      detail: configText.length > 0 ? configPath : `not found at ${configPath}`
    },
    {
      name: "MCP registration",
      ok: hasCodexReviewerConfig(configText),
      detail: hasCodexReviewerConfig(configText)
        ? "codex_cc_reviewer is configured"
        : "codex_cc_reviewer is not configured"
    }
  ];
}

export async function runDoctor(): Promise<DoctorResult[]> {
  const results = await collectDoctorResults();

  writeLine("codex-cc-reviewer doctor");
  writeLine("");
  for (const result of results) {
    writeLine(`${result.ok ? "[ok]" : "[!!]"} ${result.name}: ${result.detail}`);
  }

  if (results.some((result) => !result.ok)) {
    process.exitCode = 1;
  }

  return results;
}

function commandResult(name: string, result: Awaited<ReturnType<typeof runCommandCheck>>): DoctorResult {
  return {
    name,
    ok: result.ok,
    detail: result.output
  };
}
