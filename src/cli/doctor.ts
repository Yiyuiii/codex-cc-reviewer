import { readTextIfExists } from "../utils/fs.js";
import { runCommandCheck } from "../utils/exec.js";
import { writeLine } from "../utils/logger.js";
import {
  DEFAULT_CODEX_REVIEWER_PACKAGE_SPEC,
  getConfiguredCodexReviewerPackageSpec,
  getDefaultCodexConfigPath,
  hasCodexReviewerConfig
} from "../config/codex.js";
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface DoctorResult {
  name: string;
  ok: boolean;
  level: "ok" | "warn" | "error";
  detail: string;
}

export const MIN_CLAUDE_CODE_VERSION = "2.1.92";

export async function collectDoctorResults(): Promise<DoctorResult[]> {
  const [node, npm, codex, claude] = await Promise.all([
    runCommandCheck("node", ["--version"]),
    runCommandCheck("npm", ["--version"]),
    runCommandCheck("codex", ["--version"]),
    runCommandCheck("claude", ["--version"])
  ]);
  const claudeCli = claudeCliResult(claude);
  const claudeBackgroundResults = await collectClaudeBackgroundResults(parseClaudeVersion(claude.output));
  const configPath = getDefaultCodexConfigPath();
  const configText = await readTextIfExists(configPath);
  const hasReviewerConfig = hasCodexReviewerConfig(configText);
  const configuredPackageSpec = getConfiguredCodexReviewerPackageSpec(configText);
  const displayedPackageSpec =
    configuredPackageSpec && configuredPackageSpec !== DEFAULT_CODEX_REVIEWER_PACKAGE_SPEC
      ? configuredPackageSpec
      : undefined;

  return [
    commandResult("Node", node),
    commandResult("npm", npm),
    codexCliResult(codex),
    claudeCli,
    ...claudeBackgroundResults,
    {
      name: "Codex config",
      ok: configText.length > 0,
      level: configText.length > 0 ? "ok" : "error",
      detail: configText.length > 0 ? configPath : `not found at ${configPath}`
    },
    {
      name: "MCP registration",
      ok: hasReviewerConfig,
      level: hasReviewerConfig ? "ok" : "error",
      detail: hasReviewerConfig
        ? `codex_cc_reviewer is configured${displayedPackageSpec ? ` (${displayedPackageSpec})` : ""}`
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

export function claudeCliResult(result: Awaited<ReturnType<typeof runCommandCheck>>): DoctorResult {
  if (!result.ok) {
    return commandResult("Claude Code CLI", result);
  }

  const version = parseClaudeVersion(result.output);
  if (!version) {
    return {
      name: "Claude Code CLI",
      ok: true,
      level: "warn",
      detail: `${result.output}; could not parse version, expected >= ${MIN_CLAUDE_CODE_VERSION}`
    };
  }

  if (compareVersions(version, MIN_CLAUDE_CODE_VERSION) < 0) {
    return {
      name: "Claude Code CLI",
      ok: true,
      level: "warn",
      detail: `${result.output}; below validated version ${MIN_CLAUDE_CODE_VERSION}`
    };
  }

  return {
    name: "Claude Code CLI",
    ok: true,
    level: "ok",
    detail: result.output
  };
}

export function parseClaudeVersion(output: string): string | undefined {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const preferredLine = lines.find((line) => /Claude Code/i.test(line)) ?? lines[0] ?? "";
  const match = preferredLine.match(/\b(\d+)\.(\d+)\.(\d+)\b/);
  return match?.[0];
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split(".").map((part) => Number.parseInt(part, 10));
  const rightParts = right.split(".").map((part) => Number.parseInt(part, 10));

  for (let index = 0; index < 3; index += 1) {
    const delta = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (delta !== 0) {
      return delta;
    }
  }

  return 0;
}

async function collectClaudeBackgroundResults(currentVersion?: string): Promise<DoctorResult[]> {
  const configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
  const [daemon, jobs] = await Promise.all([
    readDaemonRosterResult(join(configDir, "daemon", "roster.json"), currentVersion),
    readBackgroundJobsResult(join(configDir, "jobs"))
  ]);

  return [daemon, jobs];
}

async function readDaemonRosterResult(path: string, currentVersion?: string): Promise<DoctorResult> {
  const text = await readTextIfExists(path);
  return daemonRosterResult(text, currentVersion);
}

export function daemonRosterResult(text: string, currentVersion?: string): DoctorResult {
  if (!text.trim()) {
    return {
      name: "Claude Code daemon",
      ok: true,
      level: "ok",
      detail: "no daemon roster found"
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      name: "Claude Code daemon",
      ok: true,
      level: "warn",
      detail: "daemon roster is not valid JSON; restart Claude Code if background sessions misbehave"
    };
  }

  const workers = getRosterWorkers(parsed);
  if (workers.length === 0) {
    return {
      name: "Claude Code daemon",
      ok: true,
      level: "ok",
      detail: "no background daemon workers registered"
    };
  }

  const mismatched = currentVersion
    ? workers.filter((worker) => worker.cliVersion && worker.cliVersion !== currentVersion)
    : [];

  if (mismatched.length > 0) {
    return {
      name: "Claude Code daemon",
      ok: true,
      level: "warn",
      detail: `${mismatched.length} worker(s) were started with a different Claude Code version; run 'claude agents' and stop stale sessions before debugging reviews`
    };
  }

  return {
    name: "Claude Code daemon",
    ok: true,
    level: "ok",
    detail: `${workers.length} background daemon worker(s) registered`
  };
}

interface RosterWorker {
  cliVersion?: string;
}

function getRosterWorkers(value: unknown): RosterWorker[] {
  if (!isRecord(value) || !isRecord(value.workers)) {
    return [];
  }

  return Object.values(value.workers)
    .filter(isRecord)
    .map((worker) => ({
      cliVersion: typeof worker.cliVersion === "string" ? worker.cliVersion : undefined
    }));
}

async function readBackgroundJobsResult(path: string): Promise<DoctorResult> {
  let entries: Array<{ name: string; text: string }> = [];

  try {
    const dirs = await readdir(path, { withFileTypes: true });
    entries = await Promise.all(
      dirs
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => ({
          name: entry.name,
          text: await readFile(join(path, entry.name, "state.json"), "utf8").catch(() => "")
        }))
    );
  } catch {
    return backgroundJobsResult([]);
  }

  return backgroundJobsResult(entries);
}

export function backgroundJobsResult(entries: Array<{ name: string; text: string }>): DoctorResult {
  const states = entries.map((entry) => {
    const parsed = parseJobState(entry.text);
    return {
      name: entry.name,
      ...parsed
    };
  });
  const blocked = states.filter((entry) => entry.state === "blocked");
  const working = states.filter((entry) => entry.state === "working");
  const unreadableCount = states.filter((entry) => entry.unreadable).length;

  if (blocked.length > 0 || unreadableCount > 0) {
    const blockedIds = blocked.map((entry) => entry.name).slice(0, 5).join(", ");
    const blockedDetail = blocked.length > 0
      ? `${blocked.length} blocked background job(s)${blockedIds ? `: ${blockedIds}` : ""}`
      : "no blocked background jobs";
    const unreadableDetail = unreadableCount > 0
      ? `; ${unreadableCount} state file(s) could not be parsed`
      : "";

    return {
      name: "Claude Code background jobs",
      ok: true,
      level: "warn",
      detail: `${blockedDetail}${unreadableDetail}; run 'claude agents' or 'claude stop <id>' if they are stale`
    };
  }

  return {
    name: "Claude Code background jobs",
    ok: true,
    level: "ok",
    detail: entries.length > 0
      ? `${entries.length} historical job(s), none blocked${working.length ? `; ${working.length} working` : ""}`
      : "no background jobs found"
  };
}

function parseJobState(text: string): { state?: string; unreadable: boolean } {
  if (!text.trim()) {
    return { unreadable: false };
  }

  try {
    const parsed: unknown = JSON.parse(text);
    if (isRecord(parsed) && typeof parsed.state === "string") {
      return { state: parsed.state, unreadable: false };
    }
    return { unreadable: false };
  } catch {
    return { unreadable: true };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formatLevel(level: DoctorResult["level"]): string {
  if (level === "ok") return "[ok]";
  if (level === "warn") return "[warn]";
  return "[!!]";
}
