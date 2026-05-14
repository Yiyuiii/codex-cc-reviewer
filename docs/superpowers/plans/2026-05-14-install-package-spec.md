# Install Package Spec Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let maintainers install the Codex MCP server config with an explicit npm package spec such as `codex-cc-reviewer@next` for rc validation.

**Architecture:** Keep the existing Codex config writer as the single source of MCP config text, but parameterize the npm package spec used in the `npx` args array. The CLI `install` command accepts `--package <spec>` and passes it to the config writer. Tests cover default install, custom package install, replacement idempotency, and invalid package specs.

**Tech Stack:** TypeScript, Commander, Vitest, existing config text mutation helpers.

---

### Task 1: Add Config Writer Support

**Files:**
- Modify: `src/config/codex.ts`
- Modify: `tests/codex-config.test.ts`

- [ ] Add a failing Vitest case that calls `installCodexReviewerConfigText(original, { packageSpec: "codex-cc-reviewer@next" })` and expects `args = ["-y", "codex-cc-reviewer@next", "serve"]`.
- [ ] Add a failing Vitest case that replaces an existing default block with a custom package block and still leaves one `[mcp_servers.codex_cc_reviewer]` table.
- [ ] Add a failing Vitest case that rejects a blank package spec.
- [ ] Add failing Vitest cases for invalid specs: `@next`, `other-package@next`, whitespace, quotes, and backslashes.
- [ ] Add a failing Vitest case for default -> custom -> default roundtrip.
- [ ] Implement `InstallCodexReviewerConfigOptions`, `normalizePackageSpec`, `tomlString`, and `buildCodexReviewerConfigBlock`.
- [ ] `normalizePackageSpec` trims input and accepts only `codex-cc-reviewer` or `codex-cc-reviewer@<non-whitespace-tag-or-version>`.
- [ ] `normalizePackageSpec` rejects blank values, whitespace inside the spec, quotes, backslashes, and package names other than `codex-cc-reviewer`.
- [ ] `tomlString` wraps values in a TOML basic string, escapes `\` and `"`, and rejects control characters.
- [ ] Keep `CODEX_REVIEWER_CONFIG_BLOCK` as `buildCodexReviewerConfigBlock()` so the default config still has one source of truth.
- [ ] Update `installCodexReviewerConfigText` and `installCodexReviewerConfig` to accept the options object while preserving default behavior.
- [ ] Run `npm test -- tests/codex-config.test.ts`.

### Task 1.5: Show Configured Package in Doctor

**Files:**
- Modify: `src/config/codex.ts`
- Modify: `src/cli/doctor.ts`
- Modify: `tests/codex-config.test.ts`

- [ ] Add a failing test for `getConfiguredCodexReviewerPackageSpec(configText)` returning `codex-cc-reviewer@next` from the MCP args array.
- [ ] Add a failing test that the helper returns `undefined` when the reviewer block is absent.
- [ ] Implement a conservative parser for the `args = [...]` line in the reviewer block.
- [ ] Update doctor output to show `MCP registration: codex_cc_reviewer is configured (codex-cc-reviewer@next)` when the package spec can be extracted.

### Task 2: Add CLI Option

**Files:**
- Modify: `src/index.ts`
- Modify: `src/cli/install.ts`

- [ ] Add a failing smoke expectation by running `node dist/index.js install --help` after build and checking the help includes `--package-spec <spec>`.
- [ ] Add `install --package-spec <spec>` in Commander.
- [ ] Pass `options.packageSpec` into `installCodexConfig`.
- [ ] Update the install success message to include the configured package spec.
- [ ] Run `npm run build` and `node dist/index.js install --help`.

### Task 3: Update Docs

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/installation.md`
- Modify: `docs/manual-setup.md`
- Modify: `AGENTS.md`
- Modify: `docs/superpowers/plans/2026-05-14-release-branching.md`

- [ ] Document stable install as unchanged.
- [ ] Document rc validation command:

```bash
npx --prefer-online -y codex-cc-reviewer@next install --package-spec codex-cc-reviewer@next
```

- [ ] Clarify that Codex must be restarted after writing a config that points to `@next`.
- [ ] Document `npx --prefer-online -y codex-cc-reviewer@next --version` as the stale-cache check.
- [ ] Run `rg "install --package|codex-cc-reviewer@next" README.md README.zh-CN.md docs AGENTS.md`.

### Task 4: Release RC

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/index.ts`
- Modify: `src/mcp/server.ts`
- Modify: `CHANGELOG.md`

- [ ] Bump version to `0.2.2-rc.0`.
- [ ] Update CLI and MCP version strings.
- [ ] Add changelog notes.
- [ ] Run `npm run typecheck`, `npm test`, `npm run build`, `node dist/index.js --version`, and `npm pack --dry-run --json`.
- [ ] Call `cc_review` for diff review after building the local implementation; the reviewer should inspect the git diff rather than relying on the installed MCP package version.
- [ ] Commit, push `next`, tag `v0.2.2-rc.0`, and verify npm `next`.
- [ ] Install the rc into the local Codex config with:

npx --prefer-online -y codex-cc-reviewer@next --version
npx --prefer-online -y codex-cc-reviewer@next install --package-spec codex-cc-reviewer@next
npx --prefer-online -y codex-cc-reviewer@next doctor
```

- [ ] Stop before stable promotion until Codex is restarted and the local `cc_review` smoke test passes.
