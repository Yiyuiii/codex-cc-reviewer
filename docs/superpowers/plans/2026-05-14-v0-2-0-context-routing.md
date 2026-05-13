# v0.2.0 Context Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route git evidence intelligently so Codex sends Claude Code a compact navigation map plus selected diff evidence, while Claude can inspect partial or omitted files with tools.

**Architecture:** Add pure diff parsing and routing modules under `src/review/`. `packet.ts` keeps its existing high-level structure but replaces monolithic raw diff insertion with `Changed Files Manifest`, `Context Routing Guidance`, and a routed per-file diff block. Existing `maxContextChars`, timeout, and one-tool `cc_review` contract remain unchanged.

**Tech Stack:** TypeScript, Zod, Vitest, execa, Commander, MCP TypeScript SDK.

---

### Task 0.5: Accepted Review Decisions

Claude Code reviewed this plan before implementation. Accepted decisions:

- [x] Budget ownership: the router owns the diff content budget. `packet.ts` passes a git-diff budget into the router and inserts the routed markdown as an atomic section, so the outer packet budget must not truncate the manifest table after routing.
- [x] Generated detection: v0.2.0 uses explicit path heuristics only. Omit `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lockb`, `*.lock`, `*.min.*`, `dist/**`, `build/**`, `coverage/**`, `.next/**`, `node_modules/**`, and binary diff blocks. Defer content-based generated-file detection.
- [x] Manifest format:

  ```md
  | File | Status | Inclusion | +/- | Reason |
  | --- | --- | --- | --- | --- |
  | src/foo.ts | modified | full | +12/-3 | source diff within budget |
  | package-lock.json | modified | omitted | +500/-400 | generated_or_lockfile |
  ```

- [x] Context guidance must explicitly tell Claude Code that `partial` and `omitted` files may contain relevant evidence and should be inspected with Read/Grep/Bash when needed.
- [x] Per-file threshold: source diffs up to `12_000` chars are included fully; larger source diffs are middle-truncated with head/tail preservation within the remaining diff budget.
- [x] Add parser/router edge tests for empty diff, binary-only/all-omitted diffs, renamed-with-content, no-newline markers, and large file counts.
- [x] Document the packet-format change in `CHANGELOG.md`.
- [x] Defer public routing override schema until users actually need it.

---

### Task 1: Pure Diff Parser

**Files:**
- Create: `src/review/diff-parser.ts`
- Test: `tests/diff-parser.test.ts`

- [x] Write tests for parsing modified, added, deleted, renamed, and binary diff blocks from unified diff text.
- [x] Implement `parseUnifiedDiff(diff: string): ParsedDiffFile[]` as a pure function.
- [x] Preserve each file's raw diff block text, path, status, approximate added/deleted lines, and binary/generated flags.

### Task 2: Context Router

**Files:**
- Create: `src/review/context-router.ts`
- Test: `tests/context-router.test.ts`

- [x] Write tests showing small source diffs are included fully.
- [x] Write tests showing large source diffs are included partially with head/tail truncation.
- [x] Write tests showing generated, lockfile, dist, and binary diffs are omitted from diff body but listed in manifest.
- [x] Implement `routeDiffForReview(files, options)` as a pure function.
- [x] Return manifest rows plus routed diff sections.

### Task 3: Packet Integration

**Files:**
- Modify: `src/review/packet.ts`
- Test: `tests/packet.test.ts`

- [x] Add failing packet tests for `Changed Files Manifest`, `Context Routing Guidance`, and routed per-file diff sections.
- [x] Keep raw status and Git Evidence Summary sections.
- [x] Replace monolithic `## Optional Git Diff` content with routed diff output when git diff evidence is present.
- [x] Preserve `autoDiscoverGit` behavior: `review_plan` gets lightweight summary only by default; `review_diff` and `adversarial_review` get routed diff evidence.

### Task 4: Docs and Release Metadata

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/tool-contract.md`
- Modify: `docs/codex-usage.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/index.ts`
- Modify: `src/mcp/server.ts`

- [x] Document the Codex/Claude tradeoff: Codex sends route map and selected evidence; Claude should inspect partial/omitted files when needed.
- [x] Document `Changed Files Manifest` and inclusion values: `full`, `partial`, `omitted`.
- [x] Bump version to `0.2.0`.

### Task 5: Verification and Release

**Files:**
- No new files.

- [x] Run targeted tests for new parser/router/packet behavior.
- [x] Run `npm run typecheck`, `npm test`, `npm run build`, `npm pack --dry-run --json`.
- [x] Run local CLI smoke tests.
- [x] Run `cc_review` on the final diff and apply accepted findings.
- [ ] Commit, tag `v0.2.0`, push, wait for release workflow, verify npm latest.

Second-pass `cc_review` found no blockers. Deferred to a future version:

- Account for structural manifest/guidance overhead in packet budgeting if real-world packets become too large.
- Add a defensive raw fallback for non-parseable diff formats.
- Add direct unit tests for the shared truncation utility if truncation behavior evolves.
