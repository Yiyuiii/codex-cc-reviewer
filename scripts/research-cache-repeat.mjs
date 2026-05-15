#!/usr/bin/env node

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_STABLE_LINES = 200;
const APPEND_SYSTEM_STABLE_LOCATION = "append-system";
const CLAUDE_HELP_TIMEOUT_MS = 15_000;
// Default append-system bodies are about 18 KiB; 20 KiB leaves argv headroom on Windows.
const MAX_APPEND_SYSTEM_BODY_BYTES = 20 * 1024;

export function parseArgs(args) {
  const parsed = {
    model: "sonnet",
    effort: "low",
    tools: "Read",
    runs: 2,
    stableLines: DEFAULT_STABLE_LINES,
    stableLocation: "stdin",
    stableTag: undefined,
    dynamicMode: "suffix",
    timeoutMs: DEFAULT_TIMEOUT_MS,
    cacheTtl: "1h",
    packetFile: undefined,
    excludeDynamicSystemPromptSections: false,
    help: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--help") {
      parsed.help = true;
      continue;
    }

    if (
      requiresValue(arg) &&
      (next === undefined || next.startsWith("--") || (arg !== "--tools" && next === ""))
    ) {
      throw new Error(`${arg} requires a value`);
    }

    if (arg === "--model") {
      parsed.model = next;
      index += 1;
    } else if (arg === "--effort") {
      parsed.effort = next;
      index += 1;
    } else if (arg === "--tools") {
      parsed.tools = next;
      index += 1;
    } else if (arg === "--runs") {
      parsed.runs = parsePositiveInt(next, "--runs");
      index += 1;
    } else if (arg === "--stable-lines") {
      parsed.stableLines = parsePositiveInt(next, "--stable-lines");
      index += 1;
    } else if (arg === "--stable-location") {
      parsed.stableLocation = parseChoice(next, "--stable-location", [
        "stdin",
        "prompt",
        APPEND_SYSTEM_STABLE_LOCATION
      ]);
      index += 1;
    } else if (arg === "--stable-tag") {
      parsed.stableTag = parseStableTag(next);
      index += 1;
    } else if (arg === "--dynamic-mode") {
      parsed.dynamicMode = parseChoice(next, "--dynamic-mode", ["same", "suffix"]);
      index += 1;
    } else if (arg === "--timeout-ms") {
      parsed.timeoutMs = parsePositiveInt(next, "--timeout-ms");
      index += 1;
    } else if (arg === "--cache-ttl") {
      parsed.cacheTtl = parseChoice(next, "--cache-ttl", ["1h", "5m"]);
      index += 1;
    } else if (arg === "--packet-file") {
      parsed.packetFile = next;
      index += 1;
    } else if (arg === "--exclude-dynamic-system-prompt-sections") {
      parsed.excludeDynamicSystemPromptSections = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (parsed.packetFile && parsed.stableTag) {
    throw new Error("--stable-tag cannot be used with --packet-file");
  }

  if (parsed.packetFile && parsed.stableLocation === APPEND_SYSTEM_STABLE_LOCATION) {
    throw new Error("--stable-location append-system cannot be used with --packet-file");
  }

  if (parsed.stableLocation === APPEND_SYSTEM_STABLE_LOCATION) {
    const appendSystemBytes = byteLength(buildSyntheticStableText(parsed.stableLines, parsed.stableTag));
    if (appendSystemBytes > MAX_APPEND_SYSTEM_BODY_BYTES) {
      throw new Error(
        `--stable-location append-system generated ${appendSystemBytes} bytes; maximum is ${MAX_APPEND_SYSTEM_BODY_BYTES}`
      );
    }
  }

  return parsed;
}

export function buildClaudeArgs(options, prompt, appendSystemPrompt) {
  const args = [
    "-p",
    prompt,
    "--model",
    options.model,
    "--effort",
    options.effort,
    "--permission-mode",
    "plan",
    "--tools",
    options.tools,
    "--output-format",
    "json",
    "--no-session-persistence"
  ];

  if (appendSystemPrompt !== undefined) {
    args.push("--append-system-prompt", appendSystemPrompt);
  }

  if (options.excludeDynamicSystemPromptSections) {
    args.push("--exclude-dynamic-system-prompt-sections");
  }

  return args;
}

export function buildRunSpec(options, runIndex, packetContent, baseEnv = process.env) {
  const dynamicSuffix =
    options.dynamicMode === "same" ? "same" : `run-${String(runIndex + 1).padStart(2, "0")}`;
  const syntheticStable = buildSyntheticStableText(options.stableLines, options.stableTag);
  let prompt = "Answer the request provided on stdin. Do not use tools.";
  let stdin;
  let appendSystemPrompt;

  if (packetContent !== undefined) {
    prompt = "Review the packet provided on stdin. Do not use tools.";
    stdin = appendDynamicSuffix(packetContent, dynamicSuffix);
  } else if (options.stableLocation === APPEND_SYSTEM_STABLE_LOCATION) {
    appendSystemPrompt = syntheticStable;
    stdin = withReturnOkInstruction("", dynamicSuffix);
  } else if (options.stableLocation === "prompt") {
    prompt = syntheticStable;
    stdin = withReturnOkInstruction("", dynamicSuffix);
  } else {
    stdin = withReturnOkInstruction(syntheticStable, dynamicSuffix);
  }

  return {
    label: `run-${runIndex + 1}`,
    args: buildClaudeArgs(options, prompt, appendSystemPrompt),
    stdin,
    env: {
      ...baseEnv,
      ENABLE_PROMPT_CACHING_1H: options.cacheTtl === "1h" ? "1" : "0"
    }
  };
}

export function summarizeRun(run) {
  const parsed = parseJson(run.stdout);
  const usage = parseUsage(parsed?.usage);

  return {
    label: run.label,
    exitCode: run.exitCode,
    elapsedMs: run.elapsedMs,
    timedOut: run.timedOut || undefined,
    stdoutBytes: byteLength(run.stdout),
    stderrBytes: byteLength(run.stderr),
    parsedJson: parsed !== undefined,
    usage,
    totalCostUsd: typeof parsed?.total_cost_usd === "number" ? parsed.total_cost_usd : undefined
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usageText());
    return;
  }
  await verifyClaudeFlagSupport(options);

  const packetContent = options.packetFile
    ? await readFile(options.packetFile, "utf8")
    : undefined;
  const results = [];

  for (let index = 0; index < options.runs; index += 1) {
    const spec = buildRunSpec(options, index, packetContent);
    const result = await runClaude(spec, options.timeoutMs);
    results.push(summarizeRun({ ...result, label: spec.label }));
  }

  const output = buildBenchmarkOutput(options, packetContent, results);

  console.log(JSON.stringify(output, null, 2));
}

export function buildBenchmarkOutput(options, packetContent, results) {
  return {
    model: options.model,
    effort: options.effort,
    tools: options.tools,
    runs: options.runs,
    stableLines: packetContent === undefined ? options.stableLines : undefined,
    stableLocation: packetContent === undefined ? options.stableLocation : "packet-file",
    stableTag: packetContent === undefined ? options.stableTag : undefined,
    appendSystemPromptBytes:
      packetContent === undefined && options.stableLocation === APPEND_SYSTEM_STABLE_LOCATION
        ? byteLength(buildSyntheticStableText(options.stableLines, options.stableTag))
        : undefined,
    excludeDynamicSystemPromptSections: options.excludeDynamicSystemPromptSections || undefined,
    dynamicMode: options.dynamicMode,
    cacheTtl: options.cacheTtl,
    packetFile: options.packetFile
      ? {
          path: options.packetFile,
          bytes: byteLength(packetContent)
        }
      : undefined,
    results
  };
}

function requiresValue(arg) {
  return [
    "--model",
    "--effort",
    "--tools",
    "--runs",
    "--stable-lines",
    "--stable-location",
    "--stable-tag",
    "--dynamic-mode",
    "--timeout-ms",
    "--cache-ttl",
    "--packet-file"
  ].includes(arg);
}

function parsePositiveInt(value, option) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`${option} must be a positive integer`);
  }

  return parsed;
}

function parseChoice(value, option, choices) {
  if (!choices.includes(value)) {
    throw new Error(`${option} must be one of: ${choices.join(", ")}`);
  }

  return value;
}

function parseStableTag(value) {
  if (!/^[a-z0-9]{12,}$/.test(value)) {
    throw new Error("--stable-tag must be at least 12 lowercase base36 characters");
  }

  return value;
}

function buildSyntheticStableText(stableLines, stableTag) {
  const prefix =
    stableTag === undefined ? "STATIC CACHE RESEARCH" : `STATIC CACHE RESEARCH ${stableTag}`;

  return Array.from(
    { length: stableLines },
    (_, index) => `${prefix} LINE ${String(index).padStart(4, "0")}: Keep this line identical across calls.`
  ).join("\n");
}

export async function verifyClaudeFlagSupport(
  options,
  command = "claude",
  readHelp = readClaudePrintHelp
) {
  const requiredFlags = [];
  if (options.stableLocation === APPEND_SYSTEM_STABLE_LOCATION) {
    requiredFlags.push("--append-system-prompt");
  }
  if (options.excludeDynamicSystemPromptSections) {
    requiredFlags.push("--exclude-dynamic-system-prompt-sections");
  }
  if (!requiredFlags.length) {
    return;
  }

  const helpText = await readHelp(command);
  const missing = requiredFlags.filter((flag) => !helpContainsFlag(helpText, flag));
  if (missing.length) {
    throw new Error(`Claude help does not advertise required flag(s): ${missing.join(", ")}`);
  }
}

function helpContainsFlag(helpText, flag) {
  const escaped = flag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Za-z0-9_-])${escaped}\\b`, "m").test(helpText);
}

function readClaudePrintHelp(command) {
  return new Promise((resolve, reject) => {
    let output = "";
    let settled = false;
    let timer;
    const finish = (callback, value) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const child = spawn(command, ["--help"], {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });
    timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(reject, new Error(`Claude help check timed out after ${CLAUDE_HELP_TIMEOUT_MS}ms`));
    }, CLAUDE_HELP_TIMEOUT_MS);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.on("error", (error) => finish(reject, error));
    child.on("close", () => finish(resolve, output));
  });
}

function appendDynamicSuffix(value, suffix) {
  return `${value}\n\nDYNAMIC_SUFFIX: ${suffix}`.trimStart();
}

function withReturnOkInstruction(value, suffix) {
  return `${appendDynamicSuffix(value, suffix)}\nReturn exactly: OK`;
}

function parseUsage(usage) {
  if (!usage || typeof usage !== "object") {
    return undefined;
  }

  const cacheCreation =
    usage.cache_creation && typeof usage.cache_creation === "object" && !Array.isArray(usage.cache_creation)
      ? usage.cache_creation
      : undefined;
  const ephemeral1hInputTokens =
    typeof cacheCreation?.ephemeral_1h_input_tokens === "number"
      ? cacheCreation.ephemeral_1h_input_tokens
      : undefined;
  const ephemeral5mInputTokens =
    typeof cacheCreation?.ephemeral_5m_input_tokens === "number"
      ? cacheCreation.ephemeral_5m_input_tokens
      : undefined;
  const parsedCacheCreation =
    ephemeral1hInputTokens !== undefined || ephemeral5mInputTokens !== undefined
      ? {
          ...(ephemeral1hInputTokens !== undefined ? { ephemeral1hInputTokens } : {}),
          ...(ephemeral5mInputTokens !== undefined ? { ephemeral5mInputTokens } : {})
        }
      : undefined;
  const parsed = {
    ...(typeof usage.input_tokens === "number" ? { inputTokens: usage.input_tokens } : {}),
    ...(typeof usage.cache_creation_input_tokens === "number"
      ? { creationInputTokens: usage.cache_creation_input_tokens }
      : {}),
    ...(typeof usage.cache_read_input_tokens === "number"
      ? { readInputTokens: usage.cache_read_input_tokens }
      : {}),
    ...(parsedCacheCreation !== undefined ? { cacheCreation: parsedCacheCreation } : {})
  };

  return Object.keys(parsed).length ? parsed : undefined;
}

export function runClaude(spec, timeoutMs, command = "claude") {
  const started = Date.now();
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let timer;
    let forceKillTimer;
    const finish = (exitCode) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      clearTimeout(forceKillTimer);
      resolve({
        stdout,
        stderr,
        exitCode,
        elapsedMs: Date.now() - started,
        timedOut
      });
    };
    const child = spawn(command, spec.args, {
      env: spec.env,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"]
    });

    timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      forceKillTimer = setTimeout(() => child.kill("SIGKILL"), 5_000);
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      stderr = stderr ? `${stderr}\n${formatError(error)}` : formatError(error);
      finish(null);
    });
    child.on("close", (exitCode) => finish(exitCode));
    child.stdin.on("error", () => {
      // The child may exit before reading stdin; the run summary already records exit details.
    });

    try {
      child.stdin.end(spec.stdin);
    } catch (error) {
      stderr = stderr ? `${stderr}\n${formatError(error)}` : formatError(error);
    }
  });
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function byteLength(value) {
  return Buffer.byteLength(value ?? "", "utf8");
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

function usageText() {
  return [
    "Usage: npm run research:cache-repeat -- [options]",
    "",
    "Options:",
    "  --model <model>                 Claude model alias, default sonnet",
    "  --effort <level>                low | medium | high | max, default low",
    "  --tools <tools>                 Claude Code tools, default Read",
    "  --runs <count>                  Sequential runs, default 2",
    "  --stable-lines <count>          Synthetic stable lines, default 200",
    "  --stable-location <stdin|prompt|append-system>",
    "                                  Synthetic stable content location, default stdin",
    "  --stable-tag <tag>              Lowercase base36 tag for synthetic lines; rejected with --packet-file",
    "  --dynamic-mode <same|suffix>    Reuse or mutate dynamic suffix, default suffix",
    "  --cache-ttl <1h|5m>             Prompt cache hint, default 1h",
    "  --packet-file <path>            Read a real preview packet and send it via stdin",
    "  --exclude-dynamic-system-prompt-sections",
    "                                  Ask Claude Code to move default dynamic system prompt sections into the first user message",
    "  --timeout-ms <ms>               Per-run timeout, default 180000",
    "",
    "For packet-file experiments, generate a packet with:",
    "  codex-cc-reviewer preview --task review_diff --context \"Cache experiment\" > packet.md"
  ].join("\n");
}

function isDirectRun(moduleUrl, argvPath) {
  return argvPath !== undefined && moduleUrl === pathToFileURL(argvPath).href;
}

if (isDirectRun(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
