# codex-cc-reviewer v0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a usable v0.1 MCP server and CLI that lets Codex run Claude Code as an external reviewer.

**Architecture:** A TypeScript ESM CLI exposes `serve`, `review`, `doctor`, `install`, and `uninstall`. The MCP server registers one read-only `cc_review` tool, validates input with `zod`, builds a redacted review packet, spawns `claude -p` with safe defaults, and returns structured results.

**Tech Stack:** Node.js >= 20, TypeScript, npm, Vitest, tsup, commander, zod, execa, @modelcontextprotocol/sdk.

---

## File Structure

- `package.json`: package metadata, npm scripts, dependencies, bin entry.
- `tsconfig.json`: TypeScript config for ESM Node.
- `vitest.config.ts`: test config.
- `src/index.ts`: CLI entrypoint.
- `src/review/schema.ts`: zod input/output schemas and types.
- `src/review/prompts.ts`: embedded review prompt text and JSON schema prompt.
- `src/review/packet.ts`: packet builder and redaction/limit application.
- `src/git/status.ts`: git status helper.
- `src/git/diff.ts`: git diff helper.
- `src/runner/claude.ts`: Claude Code runner and output parser.
- `src/mcp/server.ts`: MCP stdio server creation.
- `src/mcp/tools.ts`: `cc_review` tool registration.
- `src/cli/review.ts`: local CLI review command.
- `src/cli/doctor.ts`: environment checks.
- `src/cli/install.ts`: Codex config install command.
- `src/cli/uninstall.ts`: Codex config uninstall command.
- `src/config/codex.ts`: Codex config path and TOML text mutation helpers.
- `src/utils/exec.ts`: command existence/version helpers.
- `src/utils/fs.ts`: small filesystem helpers.
- `src/utils/logger.ts`: CLI output helpers.
- `tests/*.test.ts`: focused unit tests for schema, packet, runner, and config.
- `prompts/*.md`: prompt files included in npm package.
- `examples/*`: copyable Codex usage examples.
- `docs/*.md`: public docs.
- `.github/*`: CI and community templates.

## Tasks

### Task 1: Scaffold package and test harness

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `src/review/schema.ts`
- Test: `tests/schema.test.ts`

- [ ] Write the failing schema tests for defaults and unsafe permission rejection.
- [ ] Run `npm test -- tests/schema.test.ts`; expect failure because dependencies/source are not installed yet.
- [ ] Add package metadata and minimal schema implementation.
- [ ] Run `npm install`.
- [ ] Run `npm test -- tests/schema.test.ts`; expect pass.

### Task 2: Review packet construction

**Files:**
- Create: `src/review/prompts.ts`
- Create: `src/review/packet.ts`
- Create: `src/git/status.ts`
- Create: `src/git/diff.ts`
- Test: `tests/packet.test.ts`

- [ ] Write failing tests for packet sections, optional git injection, secret redaction, and size limit.
- [ ] Run `npm test -- tests/packet.test.ts`; expect missing implementation failures.
- [ ] Implement prompt constants, git helpers, redaction, and packet builder.
- [ ] Run packet tests; expect pass.

### Task 3: Claude runner

**Files:**
- Create: `src/runner/claude.ts`
- Test: `tests/claude-runner.test.ts`

- [ ] Write failing tests with an injected executor for safe default args, stdin prompt passing, JSON parsing, structured output extraction, and failed exit handling.
- [ ] Run `npm test -- tests/claude-runner.test.ts`; expect missing implementation failures.
- [ ] Implement runner with dependency injection and conservative command construction.
- [ ] Run runner tests; expect pass.

### Task 4: MCP server and local CLI

**Files:**
- Create: `src/mcp/server.ts`
- Create: `src/mcp/tools.ts`
- Create: `src/index.ts`
- Create: `src/cli/review.ts`
- Test: `tests/cli-review.test.ts`

- [ ] Write failing CLI review test for argument mapping without spawning real Claude.
- [ ] Run the targeted test; expect missing implementation failure.
- [ ] Implement MCP server/tool registration and local review command.
- [ ] Run the targeted test; expect pass.

### Task 5: Codex config install and doctor

**Files:**
- Create: `src/config/codex.ts`
- Create: `src/utils/exec.ts`
- Create: `src/utils/fs.ts`
- Create: `src/utils/logger.ts`
- Create: `src/cli/install.ts`
- Create: `src/cli/uninstall.ts`
- Create: `src/cli/doctor.ts`
- Test: `tests/codex-config.test.ts`

- [ ] Write failing config mutation tests for idempotent install and uninstall.
- [ ] Run config tests; expect missing implementation failure.
- [ ] Implement config path helpers, TOML text mutation, install, uninstall, and doctor checks.
- [ ] Run config tests; expect pass.

### Task 6: Public docs and repository files

**Files:**
- Create: `README.md`
- Create: `README.zh-CN.md`
- Create: `LICENSE`
- Create: `SECURITY.md`
- Create: `CONTRIBUTING.md`
- Create: `CHANGELOG.md`
- Create: `prompts/cc-reviewer.md`
- Create: `prompts/output-json.md`
- Create: `examples/config.toml`
- Create: `examples/AGENTS.md`
- Create: `docs/installation.md`
- Create: `docs/manual-setup.md`
- Create: `docs/codex-usage.md`
- Create: `docs/security.md`
- Create: `docs/tool-contract.md`
- Create: `docs/troubleshooting.md`
- Create: `docs/prior-art.md`
- Create: `.github/workflows/ci.yml`
- Create: `.github/dependabot.yml`
- Create: `.github/pull_request_template.md`
- Create: `.github/ISSUE_TEMPLATE/bug_report.yml`
- Create: `.github/ISSUE_TEMPLATE/feature_request.yml`

- [ ] Add concise README and safety docs.
- [ ] Add examples and GitHub CI/community files.
- [ ] Run markdown/package file inclusion check manually with `npm pack --dry-run`.

### Task 7: Final verification

**Files:**
- Modify as needed after verification.

- [ ] Run `npm run typecheck`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run `node dist/index.js --help`.
- [ ] Run `node dist/index.js doctor`.
- [ ] Run `npm pack --dry-run`.
- [ ] Review `git status --short`.
