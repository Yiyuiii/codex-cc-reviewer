# v0.2.3 Release Assurance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden CI and release validation for `codex-cc-reviewer` without changing review packet behavior.

**Architecture:** Add deterministic preflight scripts, CI/release workflow checks, committed stable-release validation evidence, and GitHub Release automation. Keep npm publishing in a minimal-permission job and move GitHub Release creation to a separate `contents: write` job.

**Tech Stack:** npm scripts, GitHub Actions YAML, Node/Vitest text checks, existing TypeScript build and test suite.

---

### Task 1: Add Release Assurance Tests

**Files:**
- Create: `tests/release-assurance.test.ts`

- [ ] Add tests that assert package preflight scripts exist and include pack plus CLI smoke commands.
- [ ] Add tests that assert CI has concurrency cancellation, timeout, pack/CLI smoke, and artifact upload.
- [ ] Add tests that assert release has no `workflow_dispatch`, checks tag/package version, requires stable validation evidence, verifies npm publication, and isolates GitHub Release write permission in a separate job.
- [ ] Run `npm test -- tests/release-assurance.test.ts` and confirm the new tests fail before implementation.

### Task 2: Add Preflight Scripts

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json` if npm updates script metadata

- [ ] Add `verify:release` for typecheck, test, build, npm pack dry run, CLI version, and CLI help.
- [ ] Add `preflight` that starts with `npm ci` and then runs `verify:release`.
- [ ] Run `npm test -- tests/release-assurance.test.ts` and confirm the package-script assertion passes or moves to the next missing workflow assertion.

### Task 3: Harden CI Workflow

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] Add workflow-level concurrency keyed by workflow plus pull request number or ref.
- [ ] Add `timeout-minutes: 15` to the matrix test job.
- [ ] After build, generate `npm-pack-dry-run.json`, run `node dist/index.js --version`, and run `node dist/index.js --help`.
- [ ] Upload `npm-pack-dry-run.json` and `dist/` as a seven-day artifact per Node version.
- [ ] Run `npm test -- tests/release-assurance.test.ts` and confirm CI assertions pass or move to release workflow assertions.

### Task 4: Harden Release Workflow

**Files:**
- Create: `.gitattributes`
- Modify: `.github/workflows/release.yml`

- [ ] Remove `workflow_dispatch`.
- [ ] Add publish job timeout and job-level minimal permissions.
- [ ] Print `node --version` and `npm --version`.
- [ ] Verify `package.json` version equals `${GITHUB_REF_NAME#v}`.
- [ ] For stable tags only, require `.release-validation/vX.Y.Z.md` at the tagged commit, normalize CRLF, and verify exact pass markers.
- [ ] Add `.gitattributes` rules for LF release validation files and workflow files.
- [ ] Run typecheck, tests, build, npm pack dry run, npm pack manifest validation, CLI version check, and CLI help check before publish.
- [ ] Publish with existing npm Trusted Publishing command.
- [ ] Verify `npm view codex-cc-reviewer@version version` and `npm view codex-cc-reviewer@dist-tag version` with retry.
- [ ] Add a separate `github-release` job with `contents: write` that creates or updates the GitHub Release after publish.
- [ ] Run `npm test -- tests/release-assurance.test.ts` and confirm all assertions pass.

### Task 5: Update Maintainer Docs

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/codex-usage.md`
- Modify: `examples/AGENTS.md`
- Modify: `examples/codex-global-prompt.md`
- Modify: `CHANGELOG.md`

- [ ] Document the standard preflight package and the expectation that `testsRun`, `knownRisks`, and `codexSummary` are populated for diff review.
- [ ] Document the `.release-validation/vX.Y.Z.md` stable release evidence file and required marker lines.
- [ ] Add a `0.2.3` changelog entry for release assurance hardening.
- [ ] Run docs/config tests again.

### Task 6: Full Verification and Review

**Files:**
- No new source files.

- [ ] Run `npm run typecheck`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run `npm pack --dry-run --json`.
- [ ] Run `node dist/index.js --version`.
- [ ] Run `node dist/index.js --help`.
- [ ] Call `cc_review` with `task="review_diff"`.
- [ ] Synthesize accepted, rejected, and deferred findings, patch if needed, and repeat verification if material changes are made.
