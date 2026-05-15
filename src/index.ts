#!/usr/bin/env node

import { Command } from "commander";

import { runDoctor } from "./cli/doctor.js";
import { installCodexConfig } from "./cli/install.js";
import { runLocalPreview } from "./cli/preview.js";
import { runLocalReview } from "./cli/review.js";
import { uninstallCodexConfig } from "./cli/uninstall.js";
import { serveMcp } from "./mcp/server.js";

const program = new Command();

program
  .name("codex-cc-reviewer")
  .description("Use Claude Code as an external reviewer from Codex.")
  .version("0.3.1");

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
  .option("--package-spec <spec>", "npm package spec for the MCP server, for example codex-cc-reviewer@next")
  .action(async (options) => {
    await installCodexConfig(options);
  });

program
  .command("uninstall")
  .description("Remove MCP config from Codex")
  .action(async () => {
    await uninstallCodexConfig();
  });

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

program
  .command("review")
  .description("Run a local Claude Code review without Codex")
  .requiredOption("--task <task>", "review_plan | review_diff | review_doc | adversarial_review")
  .option("--review-profile <profile>", "default | read_only")
  .requiredOption("--context <context>", "Inline review context")
  .option("--prompt <prompt>", "Backward-compatible alias for review focus")
  .option("--original-goal <goal>", "Original user goal or acceptance context")
  .option("--review-focus <focus>", "Specific review focus for this run")
  .option("--codex-summary <summary>", "Codex implementation summary")
  .option("--acceptance-criteria <criteria>", "Acceptance criteria; repeatable", collect, [])
  .option("--known-risk <risk>", "Known risk; repeatable", collect, [])
  .option("--test-run <test>", "Test or verification already run; repeatable", collect, [])
  .option("--model <model>", "Claude model alias or full model name")
  .option("--effort <effort>", "low | medium | high | max")
  .option("--output <output>", "markdown | json")
  .option("--permission-mode <mode>", "acceptEdits | auto | bypassPermissions | default | dontAsk | plan")
  .option("--tools <tools>", "Comma-separated Claude Code tool allowlist")
  .option("--cwd <cwd>", "Working directory for Claude")
  .option("--include-git-diff", "Include git diff in the review packet")
  .option("--include-git-status", "Include git status in the review packet")
  .option("--disable-auto-discover-git", "Disable task-based git evidence discovery")
  .option("--include-untracked-content", "Include selected untracked text file bodies")
  .option("--no-include-untracked-content", "Disable selected untracked text file bodies")
  .option("--redact-secrets", "Apply best-effort secret redaction before building the packet")
  .option("--max-context-chars <chars>", "Maximum packet context characters")
  .option("--no-stream", "Disable Claude Code stream-json output")
  .option("--no-include-partial-messages", "Disable partial message events when streaming")
  .option("--no-include-hook-events", "Disable hook events when streaming")
  .option("--no-verbose", "Disable Claude Code verbose mode when streaming")
  .option("--cache-ttl <ttl>", "Prompt cache TTL hint: 5m | 1h")
  .action(async (options) => {
    const { knownRisk, testRun, disableAutoDiscoverGit, ...reviewOptions } = options;
    reviewOptions.knownRisks = knownRisk;
    reviewOptions.testsRun = testRun;
    if (disableAutoDiscoverGit) {
      reviewOptions.autoDiscoverGit = false;
    }
    await runLocalReview(reviewOptions);
  });

program
  .command("preview")
  .description("Print a review packet without starting Claude Code")
  .requiredOption("--task <task>", "review_plan | review_diff | review_doc | adversarial_review")
  .option("--review-profile <profile>", "default | read_only")
  .requiredOption("--context <context>", "Inline review context")
  .option("--prompt <prompt>", "Backward-compatible alias for review focus")
  .option("--original-goal <goal>", "Original user goal or acceptance context")
  .option("--review-focus <focus>", "Specific review focus for this run")
  .option("--codex-summary <summary>", "Codex implementation summary")
  .option("--acceptance-criteria <criteria>", "Acceptance criteria; repeatable", collect, [])
  .option("--known-risk <risk>", "Known risk; repeatable", collect, [])
  .option("--test-run <test>", "Test or verification already run; repeatable", collect, [])
  .option("--model <model>", "Claude model alias or full model name")
  .option("--effort <effort>", "low | medium | high | max")
  .option("--output <output>", "markdown | json")
  .option("--permission-mode <mode>", "acceptEdits | auto | bypassPermissions | default | dontAsk | plan")
  .option("--tools <tools>", "Comma-separated Claude Code tool allowlist")
  .option("--cwd <cwd>", "Working directory for git evidence discovery")
  .option("--include-git-diff", "Include git diff in the review packet")
  .option("--include-git-status", "Include git status in the review packet")
  .option("--disable-auto-discover-git", "Disable task-based git evidence discovery")
  .option("--include-untracked-content", "Include selected untracked text file bodies")
  .option("--no-include-untracked-content", "Disable selected untracked text file bodies")
  .option("--redact-secrets", "Apply best-effort secret redaction before building the packet")
  .option("--max-context-chars <chars>", "Maximum packet context characters")
  .option("--cache-ttl <ttl>", "Prompt cache TTL hint: 5m | 1h")
  .action(async (options) => {
    const { knownRisk, testRun, disableAutoDiscoverGit, ...previewOptions } = options;
    previewOptions.knownRisks = knownRisk;
    previewOptions.testsRun = testRun;
    if (disableAutoDiscoverGit) {
      previewOptions.autoDiscoverGit = false;
    }
    await runLocalPreview(previewOptions);
  });

await program.parseAsync();
