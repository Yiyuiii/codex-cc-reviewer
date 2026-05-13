#!/usr/bin/env node

import { Command } from "commander";

import { runDoctor } from "./cli/doctor.js";
import { installCodexConfig } from "./cli/install.js";
import { runLocalReview } from "./cli/review.js";
import { uninstallCodexConfig } from "./cli/uninstall.js";
import { serveMcp } from "./mcp/server.js";

const program = new Command();

program
  .name("codex-cc-reviewer")
  .description("Use Claude Code as an external reviewer from Codex.")
  .version("0.1.2");

program
  .command("serve")
  .description("Start MCP stdio server")
  .action(async () => {
    await serveMcp();
  });

program
  .command("doctor")
  .description("Check Node, Codex, Claude Code, and MCP setup")
  .action(async () => {
    await runDoctor();
  });

program
  .command("install")
  .description("Install MCP config into Codex")
  .action(async () => {
    await installCodexConfig();
  });

program
  .command("uninstall")
  .description("Remove MCP config from Codex")
  .action(async () => {
    await uninstallCodexConfig();
  });

program
  .command("review")
  .description("Run a local Claude Code review without Codex")
  .requiredOption("--task <task>", "review_plan | review_diff | review_doc | adversarial_review")
  .requiredOption("--context <context>", "Inline review context")
  .option("--prompt <prompt>", "Additional review goal")
  .option("--model <model>", "Claude model alias or full model name")
  .option("--effort <effort>", "low | medium | high | max")
  .option("--output <output>", "markdown | json")
  .option("--permission-mode <mode>", "acceptEdits | auto | bypassPermissions | default | dontAsk | plan")
  .option("--tools <tools>", "Comma-separated Claude Code tool allowlist")
  .option("--max-turns <turns>", "Maximum Claude turns")
  .option("--max-budget-usd <usd>", "Maximum Claude Code spend in USD")
  .option("--cwd <cwd>", "Working directory for Claude")
  .option("--include-git-diff", "Include git diff in the review packet")
  .option("--include-git-status", "Include git status in the review packet")
  .option("--no-stream", "Disable Claude Code stream-json output")
  .option("--no-include-partial-messages", "Disable partial message events when streaming")
  .option("--no-include-hook-events", "Disable hook events when streaming")
  .option("--no-verbose", "Disable Claude Code verbose mode when streaming")
  .option("--cache-ttl <ttl>", "Prompt cache TTL hint: 5m | 1h")
  .action(async (options) => {
    await runLocalReview(options);
  });

await program.parseAsync();
