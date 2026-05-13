# v0.1.6 Unrestricted Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove public cost and turn caps from `cc_review`, keep timeout as service protection, and improve review packets with head/tail truncation plus lightweight git evidence.

**Architecture:** The MCP input schema becomes strict so removed fields fail loudly instead of being silently ignored. Packet construction keeps the existing weighted-budget model for v0.1.6, but truncates oversized blocks from the middle and adds a concise Git Evidence Summary before raw status/diff. Full per-file/hunk budgeting is deferred to a later release.

**Tech Stack:** TypeScript, Zod, Vitest, execa, Commander, MCP TypeScript SDK.

---

### Task 1: Remove Public Review Caps

**Files:**
- Modify: `src/review/schema.ts`
- Modify: `src/runner/claude.ts`
- Modify: `src/cli/review.ts`
- Modify: `src/index.ts`
- Test: `tests/schema.test.ts`
- Test: `tests/claude-runner.test.ts`
- Test: `tests/cli-review.test.ts`

- [ ] Add failing schema tests that reject `maxTurns`, `maxBudgetUsd`, and unknown input keys.
- [ ] Add failing runner expectation that default args contain no `--max-turns` or `--max-budget-usd`.
- [ ] Remove `maxTurns` and `maxBudgetUsd` from schema, CLI options, local CLI option coercion, runner arg construction, and tests.
- [ ] Make `CcReviewInputSchema` strict.
- [ ] Run targeted tests for schema, runner, and local CLI.

### Task 2: Middle Truncation

**Files:**
- Modify: `src/review/packet.ts`
- Test: `tests/packet.test.ts`

- [ ] Add a failing packet test that oversized context preserves a unique head and unique tail while omitting a unique middle.
- [ ] Replace packet block truncation with 60% head / 40% tail middle truncation.
- [ ] Use marker `[TRUNCATED N chars from middle]`.
- [ ] Leave activity timeline truncation unchanged in v0.1.6.

### Task 3: Git Evidence Summary

**Files:**
- Create: `src/git/summary.ts`
- Modify: `src/review/packet.ts`
- Test: `tests/git.test.ts`
- Test: `tests/packet.test.ts`

- [ ] Add failing git tests for diff stat, name-status, and untracked manifest.
- [ ] Add failing packet tests showing lightweight git summary is auto-discovered for plan reviews while raw status/diff remain diff-oriented.
- [ ] Implement `getGitSummary(cwd)` using `git diff --stat HEAD`, `git diff --name-status HEAD`, and `git ls-files --others --exclude-standard`, with no-HEAD fallback to cached/worktree diff summaries.
- [ ] Add `## Git Evidence Summary` packet section with small weighted budget.
- [ ] Keep full raw git status/diff auto-discovery limited to `review_diff` and `adversarial_review`.

### Task 4: Docs, Version, and Verification

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/tool-contract.md`
- Modify: `docs/codex-usage.md`
- Modify: `docs/superpowers/specs/2026-05-13-codex-cc-reviewer-design.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/index.ts`
- Modify: `src/mcp/server.ts`

- [ ] Remove docs that recommend `maxBudgetUsd` or `maxTurns`.
- [ ] Document that timeout is service hang protection, not a model capability cap.
- [ ] Document head/tail packet truncation and Git Evidence Summary.
- [ ] Bump version to `0.1.6`.
- [ ] Run `npm run typecheck`, `npm test`, `npm run build`, `npm pack --dry-run --json`, and local CLI smoke tests.
- [ ] Run `cc_review` on the final diff, synthesize accepted findings, then publish if clean.
