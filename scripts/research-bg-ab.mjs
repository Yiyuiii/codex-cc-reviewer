#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const DEFAULT_PROMPT = `Review this tiny synthetic diff. Return exactly these sections: Verdict, Blocking issues, Non-blocking issues, Missing tests, Risk assessment, Suggested next action.

diff --git a/src/auth.ts b/src/auth.ts
@@
- if (user.isAdmin) return true;
+ return true;`;

const options = parseArgs(process.argv.slice(2));
const profileDir = resolve(options.profileDir ?? process.env.CLAUDE_CONFIG_DIR ?? join(process.env.USERPROFILE ?? process.env.HOME ?? ".", ".claude-plan"));
const env = {
  ...process.env,
  CLAUDE_CONFIG_DIR: profileDir
};

console.log(`Using CLAUDE_CONFIG_DIR=${profileDir}`);
console.log("This is a research harness only. The bg path reads Claude Code internal job state/transcript files.");

const auth = await runClaude(["auth", "status", "--text"], { env, timeoutMs: 20_000 });
if (auth.exitCode !== 0) {
  console.error("Claude Code is not authenticated for the selected profile.");
  console.error(trimOutput(auth.stderr || auth.stdout));
  process.exit(1);
}

const prompt = options.prompt ?? DEFAULT_PROMPT;
const model = options.model ?? "opus";
const effort = options.effort ?? "max";

const printRun = await timed(() =>
  runClaude(
    [
      "-p",
      "Review the packet provided on stdin.",
      "--model",
      model,
      "--effort",
      effort,
      "--permission-mode",
      "plan",
      "--tools",
      "Read",
      "--output-format",
      "json",
      "--verbose",
      "--no-session-persistence"
    ],
    { env, input: prompt, timeoutMs: options.timeoutMs }
  )
);

const printReview = extractPrintReview(printRun.value.stdout);

const bgRun = await timed(async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "cc-review-bg-ab-"));
  const mcpConfig = join(tempDir, "empty-mcp.json");
  await writeFile(mcpConfig, JSON.stringify({ mcpServers: {} }), "utf8");

  const launched = await runClaude(
    [
      "--bg",
      "--name",
      "cc-reviewer-bg-ab-smoke",
      "--model",
      model,
      "--effort",
      effort,
      "--disable-slash-commands",
      "--tools",
      "Read",
      "--strict-mcp-config",
      "--mcp-config",
      mcpConfig,
      // Claude Code bg sessions take the prompt as a positional argument. Keep
      // the default smoke prompt small; use this only as a local research tool.
      "--",
      prompt
    ],
    { env, timeoutMs: 30_000 }
  );
  const jobId = parseJobId(`${launched.stdout}\n${launched.stderr}`);
  if (!jobId) {
    return { launched, jobId: undefined, state: undefined, review: "" };
  }

  const state = await waitForBgState(profileDir, jobId, options.timeoutMs);
  const review = state?.linkScanPath ? await readLastAssistantText(state.linkScanPath) : "";
  return { launched, jobId, state, review };
});

const summary = {
  profileDir,
  model,
  effort,
  print: {
    exitCode: printRun.value.exitCode,
    timedOut: printRun.value.timedOut,
    elapsedMs: printRun.elapsedMs,
    reviewChars: printReview.length,
    caughtAuthBypass: containsAuthBypassSignal(printReview)
  },
  bg: {
    submitElapsedMs: bgRun.value.launched.elapsedMs,
    totalElapsedMs: bgRun.elapsedMs,
    exitCode: bgRun.value.launched.exitCode,
    submitTimedOut: bgRun.value.launched.timedOut,
    jobId: bgRun.value.jobId,
    state: bgRun.value.state?.state,
    stateDetail: bgRun.value.state?.detail,
    reviewChars: bgRun.value.review.length,
    caughtAuthBypass: containsAuthBypassSignal(bgRun.value.review),
    transcriptPath: bgRun.value.state?.linkScanPath
  }
};

console.log(JSON.stringify(summary, null, 2));

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];
    if (arg === "--profile-dir" && next) {
      parsed.profileDir = next;
      index += 1;
    } else if (arg === "--model" && next) {
      parsed.model = next;
      index += 1;
    } else if (arg === "--effort" && next) {
      parsed.effort = next;
      index += 1;
    } else if (arg === "--timeout-ms" && next) {
      parsed.timeoutMs = Number.parseInt(next, 10);
      index += 1;
    } else if (arg === "--prompt" && next) {
      parsed.prompt = next;
      index += 1;
    } else if (arg === "--help") {
      console.log("Usage: npm run research:bg-ab -- [--profile-dir <path>] [--model <model>] [--effort <level>] [--timeout-ms <ms>]");
      process.exit(0);
    }
  }

  return {
    timeoutMs: Number.isFinite(parsed.timeoutMs) ? parsed.timeoutMs : 180_000,
    ...parsed
  };
}

async function timed(task) {
  const started = Date.now();
  const value = await task();
  return {
    value,
    elapsedMs: Date.now() - started
  };
}

function runClaude(args, { env, input, timeoutMs }) {
  const started = Date.now();
  return new Promise((resolvePromise) => {
    const child = spawn("claude", args, {
      env,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let forceKillTimer;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      forceKillTimer = setTimeout(() => {
        child.kill("SIGKILL");
      }, 5_000);
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      clearTimeout(forceKillTimer);
      resolvePromise({
        stdout,
        stderr,
        exitCode,
        elapsedMs: Date.now() - started,
        timedOut
      });
    });

    if (input) {
      child.stdin.end(input);
    } else {
      child.stdin.end();
    }
  });
}

function extractPrintReview(stdout) {
  try {
    const parsed = JSON.parse(stdout);
    if (Array.isArray(parsed)) {
      const result = [...parsed].reverse().find((entry) => entry?.type === "result");
      return typeof result?.result === "string" ? result.result : stdout;
    }
    return typeof parsed.result === "string" ? parsed.result : stdout;
  } catch {
    return stdout;
  }
}

function parseJobId(text) {
  const match = text.match(/backgrounded\s*(?:[.:]|\u00b7)\s*([A-Za-z0-9_-]{6,})/);
  return match?.[1];
}

async function waitForBgState(profileDir, jobId, timeoutMs) {
  const statePath = join(profileDir, "jobs", jobId, "state.json");
  const started = Date.now();
  let lastState;

  while (Date.now() - started < timeoutMs) {
    await sleep(1_000);
    const text = await readFile(statePath, "utf8").catch(() => "");
    if (!text) {
      continue;
    }
    const state = parseJson(text);
    if (!state) {
      continue;
    }
    lastState = state;
    if (["done", "failed", "blocked", "crashed", "stopped"].includes(state.state)) {
      return state;
    }
    if (state.tempo === "idle" && state.inFlight?.tasks === 0 && state.linkScanPath) {
      const review = await readLastAssistantText(state.linkScanPath);
      if (review) {
        return state;
      }
    }
  }

  return lastState;
}

async function readLastAssistantText(path) {
  const text = await readFile(path, "utf8").catch(() => "");
  let last = "";
  for (const line of text.split(/\r?\n/)) {
    const event = parseJson(line);
    const content = event?.message?.content;
    if (!Array.isArray(content)) {
      continue;
    }
    const textBlocks = content
      .filter((block) => block?.type === "text" && typeof block.text === "string")
      .map((block) => block.text);
    if (textBlocks.length > 0) {
      last = textBlocks.join("\n");
    }
  }
  return last;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function containsAuthBypassSignal(text) {
  return /authorization\s+bypass|auth\s+bypass|privilege\s+escalation|missing\s+admin\s+check|unguarded\s+admin|always\s+returns?\s+true/i.test(text);
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function trimOutput(value) {
  return value.trim().slice(-2_000);
}
