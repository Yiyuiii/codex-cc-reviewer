# Cache Ground Truth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the smallest research slice that can determine whether Claude Code print-mode cache hits include `codex-cc-reviewer` packet content before any packet-order optimization is attempted.

**Architecture:** Keep runtime review behavior unchanged. Extend cache usage parsing and output schema so maintainer experiments can distinguish uncached input, 1-hour cache creation, and 5-minute cache creation. Add a maintainer-only repeat-call benchmark script that runs controlled `claude -p` calls and writes JSON evidence without storing review packet content.

**Tech Stack:** TypeScript ESM, Zod, Vitest, Node.js CLI scripts, Claude Code CLI.

---

## Scope

Accepted:

- Parse and expose additional Claude usage fields:
  - `input_tokens`
  - `cache_creation.ephemeral_1h_input_tokens`
  - `cache_creation.ephemeral_5m_input_tokens`
- Preserve current `cache.creationInputTokens`, `cache.readInputTokens`, and `cache.effective` fields.
- Add a maintainer research script for repeat-call cache experiments using `claude -p`.
- Add tests for parser, stream parser propagation, schema, formatter output, and benchmark argument handling.
- Document that packet reorder is not yet an implementation target.

Rejected for this slice:

- Do not change packet section order.
- Do not add model/effort presets.
- Do not add public cost caps or turn caps.
- Do not publish from a local shell; GitHub release workflow remains the only real npm publication path.

## File Structure

- Modify `src/review/cache.ts`: extend `CacheUsage` and parse nested cache creation details.
- Modify `src/review/schema.ts`: expose new cache fields in MCP structured output.
- Modify `src/review/activity.ts`: propagate parsed cache details from stream-json result events.
- Modify `src/review/format.ts`: show the new cache evidence in formatted output.
- Modify `src/runner/claude.ts`: preserve new cache fields when parsing non-stream JSON output.
- Create `scripts/research-cache-repeat.mjs`: maintainer-only local benchmark for repeated `claude -p` cache behavior.
- Modify `package.json`: add a `research:cache-repeat` script and include the script in the published `files` array, matching `scripts/research-bg-ab.mjs`.
- Add or modify tests:
  - `tests/cache.test.ts`
  - `tests/activity.test.ts`
  - `tests/claude-runner.test.ts`
  - `tests/format.test.ts`
  - create `tests/research-cache-repeat.test.ts`
- Modify docs:
  - `docs/troubleshooting.md`
  - `docs/tool-contract.md`
  - `README.md`
  - `README.zh-CN.md`

### Task 1: Cache Usage Parser

**Files:**
- Modify: `src/review/cache.ts`
- Test: `tests/cache.test.ts`

- [ ] **Step 1: Write failing parser tests**

Add coverage that `parseCacheUsage` reads top-level `input_tokens`, existing cache fields, and nested `cache_creation` TTL buckets:

```ts
expect(parseCacheUsage({
  input_tokens: 7,
  cache_creation_input_tokens: 11,
  cache_read_input_tokens: 13,
  cache_creation: {
    ephemeral_1h_input_tokens: 17,
    ephemeral_5m_input_tokens: 19
  }
})).toEqual({
  inputTokens: 7,
  creationInputTokens: 11,
  readInputTokens: 13,
  cacheCreation: {
    ephemeral1hInputTokens: 17,
    ephemeral5mInputTokens: 19
  }
});
```

Also add parser tests for:

- `{ input_tokens: 7 }` returns `{ inputTokens: 7 }`.
- bucket-only payloads return `cacheCreation` and make `analyzeCacheUsage("1h", ...)` report `effective: "write"` when bucket creation tokens are present.
- malformed `cache_creation` values such as `null`, `7`, arrays, and string token values are ignored instead of coerced.

Use the camelCase mapping `ephemeral_1h_input_tokens -> ephemeral1hInputTokens` and `ephemeral_5m_input_tokens -> ephemeral5mInputTokens`.

- [ ] **Step 2: Run focused test and confirm RED**

Run:

```bash
npm test -- tests/cache.test.ts
```

Expected: fails because `inputTokens` and `cacheCreation` are not parsed yet.

- [ ] **Step 3: Implement parser extension**

Update `CacheUsage` and `parseCacheUsage` so missing fields remain `undefined`, but present numeric fields are preserved.
Update the early-return guard so it returns `undefined` only when all known usage fields are absent.
Use aggregate creation tokens from `creationInputTokens` when present, otherwise sum `ephemeral1hInputTokens` and `ephemeral5mInputTokens` for the `write` decision.

- [ ] **Step 4: Run focused test and confirm GREEN**

Run:

```bash
npm test -- tests/cache.test.ts
```

Expected: cache tests pass.

### Task 2: Output Schema And Formatting

**Files:**
- Modify: `src/review/schema.ts`
- Modify: `src/review/format.ts`
- Modify: `tests/format.test.ts`

- [ ] **Step 1: Write failing formatter/schema tests**

Extend existing formatted-output coverage so a result with:

```ts
cache: {
  inputTokens: 7,
  creationInputTokens: 11,
  readInputTokens: 13,
  cacheCreation: {
    ephemeral1hInputTokens: 17,
    ephemeral5mInputTokens: 19
  },
  effective: "hit"
}
```

prints `input tokens`, `cache creation 1h tokens`, and `cache creation 5m tokens`.
Add a second formatter test where `cache` contains only `inputTokens`; it should still print `input tokens: 7`.

- [ ] **Step 2: Run focused test and confirm RED**

Run:

```bash
npm test -- tests/format.test.ts
```

Expected: fails because the formatter and schema do not yet know the new fields.

- [ ] **Step 3: Implement schema and formatter**

Add optional cache fields to `CcReviewOutputSchema.cache` and include compact formatted lines in `formatReviewResult`.

- [ ] **Step 4: Run focused test and confirm GREEN**

Run:

```bash
npm test -- tests/format.test.ts tests/schema.test.ts
```

Expected: focused tests pass.

### Task 3: Runner And Stream Propagation

**Files:**
- Modify: `src/runner/claude.ts`
- Modify: `src/review/activity.ts`
- Modify: `tests/claude-runner.test.ts`
- Modify: `tests/activity.test.ts`

- [ ] **Step 1: Write failing propagation tests**

Extend one streaming runner test and one non-stream JSON test so usage with `input_tokens` and nested `cache_creation` survives through final `CcReviewOutput.cache`.

- [ ] **Step 2: Run focused tests and confirm RED**

Run:

```bash
npm test -- tests/claude-runner.test.ts tests/activity.test.ts
```

Expected: fails because the new fields are dropped.

- [ ] **Step 3: Implement propagation**

Update internal parsed-output types to import `CacheUsage` and use `Omit<CacheUsage, "effective">` instead of repeating inline cache shapes.
Add propagation tests under both `cacheTtl: "1h"` and `cacheTtl: "5m"` so TTL bucket evidence is preserved independently from the requested cache TTL.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run:

```bash
npm test -- tests/claude-runner.test.ts tests/activity.test.ts
```

Expected: focused tests pass.

### Task 4: Repeat-Call Cache Research Harness

**Files:**
- Create: `scripts/research-cache-repeat.mjs`
- Modify: `package.json`
- Create: `tests/research-cache-repeat.test.ts`

- [ ] **Step 1: Write failing harness tests**

Test the script's exported pure helpers:

- `parseArgs`
- `buildClaudeArgs`
- `summarizeRun`

The helpers must support:

- `--model`
- `--effort`
- `--tools`
- `--runs`
- `--stable-lines`
- `--stable-location stdin|prompt`
- `--dynamic-mode same|suffix`
- `--timeout-ms`
- `--cache-ttl 1h|5m`
- `--packet-file <path>`

The default synthetic experiment should support this matrix:

| Experiment | Setup | Signal |
| --- | --- | --- |
| Exact repeat | `--dynamic-mode same --runs 2` | If user content is cacheable, run 2 should show materially higher `cache.readInputTokens` or lower `cache.creationInputTokens`. |
| Stable prefix with changed suffix | `--dynamic-mode suffix --runs 2` | If prefix caching applies to user content, read tokens should increase roughly with the stable prefix size. |
| Actual packet file repeat | `--packet-file packet.md --dynamic-mode same --runs 2` | Tests a real `codex-cc-reviewer preview` packet body without emitting that content. |
| Actual packet plus changed suffix | `--packet-file packet.md --dynamic-mode suffix --runs 2` | Tests whether a real packet prefix survives a changed tail. |

The script cannot prove cache-control marker placement by itself; it provides repeatable evidence for deciding whether packet reorder is worth deeper API-request capture.

- [ ] **Step 2: Run focused test and confirm RED**

Run:

```bash
npm test -- tests/research-cache-repeat.test.ts
```

Expected: fails because the script does not exist.

- [ ] **Step 3: Implement script**

Implement a Node ESM script that:

- runs `claude -p` sequentially
- keeps `--no-session-persistence`
- sets `ENABLE_PROMPT_CACHING_1H="1"` when `--cache-ttl 1h` is requested
- explicitly sets `ENABLE_PROMPT_CACHING_1H="0"` when `--cache-ttl 5m` is requested
- emits one JSON object with metadata and per-run usage summaries
- never writes packet content to disk
- never includes prompt, packet, stdin, or file body content in emitted JSON
- can read a packet from `--packet-file` but only reports the file path and byte length
- sends packet content from `--packet-file` to `claude` through stdin only; packet content must never appear in argv
- summarizes Claude stderr by length only and never embeds stderr text verbatim
- exports pure helpers for tests while executing only when run as the entry script
- recommends `codex-cc-reviewer preview --task review_diff --context "..." > packet.md` as the source for a real packet-file experiment

- [ ] **Step 4: Add npm script**

Add:

```json
"research:cache-repeat": "node scripts/research-cache-repeat.mjs",
"files": ["scripts/research-cache-repeat.mjs"]
```

Preserve the existing `files` entries and add `scripts/research-cache-repeat.mjs` next to `scripts/research-bg-ab.mjs`.

- [ ] **Step 5: Run focused test and confirm GREEN**

Run:

```bash
npm test -- tests/research-cache-repeat.test.ts
```

Expected: harness tests pass.

Harness tests must include a sentinel leakage regression: when helper inputs contain a unique secret-like sentinel in `prompt`, `packet`, or `stdin`, the serialized summary must not contain that sentinel.
Importing `scripts/research-cache-repeat.mjs` in a unit test must not spawn `claude`.
Harness tests must assert `ENABLE_PROMPT_CACHING_1H` resolves to `"1"` for `--cache-ttl 1h` and `"0"` for `--cache-ttl 5m`.
Harness tests must assert packet-file sentinel content is absent from Claude argv and serialized JSON summaries.

### Task 5: Documentation

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/tool-contract.md`
- Modify: `docs/troubleshooting.md`

- [ ] **Step 1: Update docs**

Document:

- additional cache fields in output
- `research:cache-repeat` as a maintainer research command
- packet reorder remains unimplemented until cache ground truth shows it can help
- publication source of truth remains GitHub workflow, not local npm publish
- `cache.effective: "disabled"` means the 1-hour hint was not requested; other reported cache fields can still show 5-minute cache activity
- `cache.inputTokens` means Claude Code's reported residual uncached input tokens, not total input tokens
- all added cache sub-fields are optional and backward-compatible

- [ ] **Step 2: Run doc-focused checks**

Run:

```bash
rg -n "input tokens|cache creation 1h|research:cache-repeat|packet reorder|release\\.yml|Trusted Publishing|GitHub release workflow|cache_creation_input_tokens" README.md README.zh-CN.md docs/tool-contract.md docs/troubleshooting.md
```

Expected: new docs are discoverable in English and Chinese README plus tool/troubleshooting docs.

### Task 6: Full Verification And Review

**Files:**
- All modified files

- [ ] **Step 1: Run deterministic checks**

Run:

```bash
npm run verify:release
```

Expected: all pass.

- [ ] **Step 2: Run final `cc_review` diff review**

Call `cc_review` with `task: "review_diff"`, include the verification commands and results in `testsRun`, and ask for correctness, regressions, missing tests, and release-process drift.

- [ ] **Step 3: Synthesize review findings**

Accept, reject, or defer each material finding. Patch accepted material findings and rerun relevant verification.
