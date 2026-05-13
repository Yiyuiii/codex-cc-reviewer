#!/usr/bin/env node

import { Command } from "commander";

import { runLocalReview } from "./cli/review.js";
import { serveMcp } from "./mcp/server.js";

const program = new Command();

program
  .name("codex-cc-reviewer")
  .description("Use Claude Code as an external reviewer from Codex.")
  .version("0.1.0");

program
  .command("serve")
  .description("Start MCP stdio server")
  .action(async () => {
    await serveMcp();
  });

program
  .command("review")
  .description("Run a local Claude Code review without Codex")
  .requiredOption("--task <task>", "review_plan | review_diff | review_doc | adversarial_review")
  .requiredOption("--context <context>", "Inline review context")
  .option("--prompt <prompt>", "Additional review goal")
  .option("--model <model>", "Claude model alias or full model name")
  .option("--effort <effort>", "low | medium | high | xhigh | max")
  .option("--output <output>", "markdown | json")
  .option("--permission-mode <mode>", "default | plan | dontAsk")
  .option("--tools <tools>", "Comma-separated Claude Code tool allowlist")
  .option("--max-turns <turns>", "Maximum Claude turns")
  .option("--max-budget-usd <usd>", "Maximum Claude Code spend in USD")
  .option("--cwd <cwd>", "Working directory for Claude")
  .option("--include-git-diff", "Include git diff in the review packet")
  .option("--include-git-status", "Include git status in the review packet")
  .action(async (options) => {
    await runLocalReview(options);
  });

await program.parseAsync();
