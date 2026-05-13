import { readTextIfExists } from "../utils/fs.js";
import { runCommandCheck } from "../utils/exec.js";
import { writeLine } from "../utils/logger.js";
import { getDefaultCodexConfigPath, hasCodexReviewerConfig } from "../config/codex.js";

export interface DoctorResult {
  name: string;
  ok: boolean;
  level: "ok" | "warn" | "error";
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
    codexCliResult(codex),
    commandResult("Claude Code CLI", claude),
    {
      name: "Codex config",
      ok: configText.length > 0,
      level: configText.length > 0 ? "ok" : "error",
      detail: configText.length > 0 ? configPath : `not found at ${configPath}`
    },
    {
      name: "MCP registration",
      ok: hasCodexReviewerConfig(configText),
      level: hasCodexReviewerConfig(configText) ? "ok" : "error",
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
    writeLine(`${formatLevel(result.level)} ${result.name}: ${result.detail}`);
  }

  if (shouldDoctorFail(results)) {
    process.exitCode = 1;
  }

  return results;
}

export function shouldDoctorFail(results: DoctorResult[]): boolean {
  return results.some((result) => result.level === "error");
}

function commandResult(name: string, result: Awaited<ReturnType<typeof runCommandCheck>>): DoctorResult {
  return {
    name,
    ok: result.ok,
    level: result.ok ? "ok" : "error",
    detail: result.output
  };
}

function codexCliResult(result: Awaited<ReturnType<typeof runCommandCheck>>): DoctorResult {
  if (result.ok) {
    return {
      name: "Codex CLI",
      ok: true,
      level: "ok",
      detail: result.output
    };
  }

  return {
    name: "Codex CLI",
    ok: false,
    level: "warn",
    detail: "not runnable from PATH; Codex app MCP config may still work"
  };
}

function formatLevel(level: DoctorResult["level"]): string {
  if (level === "ok") return "[ok]";
  if (level === "warn") return "[warn]";
  return "[!!]";
}
