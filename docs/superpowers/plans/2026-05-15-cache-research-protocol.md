# Repeat-Call Cache Research Protocol

> **For agentic workers:** This is a pre-registered research protocol, not an implementation plan. Do not change review packet ordering during this protocol. If implementation becomes justified, write a separate implementation plan and run the Codex + `cc_review` convergence workflow again.

**Goal:** Decide whether repeat-call prompt-cache behavior justifies a packet-order optimization, a TTL/cadence-only change, or closing the cache-reorder idea as low ROI.

**Baseline:** Commit `1951145` (`feat: add cache repeat research foundation`) is the clean foundation. `npm run verify:release` passed on that committed HEAD before this protocol was written.

**Non-goals:**

- No packet reorder in this protocol.
- No public API or output-schema churn unless the existing cache fields prove unusable.
- No npm publication or local publish. Real publication remains `.github/workflows/release.yml` through Trusted Publishing after version tags.
- No large experiment matrix without an early sanity pass.

## Evidence Hierarchy

1. **Production path evidence:** dedicated `cc_review` paired calls using the normal tool runner and reported `cache` fields. This is the decision-driving evidence for `cc_review`.
2. **Packet-file harness evidence:** `npm run research:cache-repeat -- --packet-file ...`. This is directional evidence for packet-like stdin content, not a byte-equivalent `cc_review` replay.
3. **Synthetic harness evidence:** stable generated text through `research:cache-repeat`. This only proves Claude Code print-mode caching can be observed by the harness.
4. **Documentation evidence:** Anthropic prompt-caching docs. These explain expected cache fields and static-prefix behavior, but not Claude Code's internal cache-control marker placement.

Both production `cc_review` and the harness set `ENABLE_PROMPT_CACHING_1H` for the 1-hour cache hint. Existing `cc_review` cache hits observed before this protocol may be cited as background, but decision thresholds below should be applied mechanically to the protocol run evidence.

## Metrics

For each run, record:

- `readInputTokens = cache.readInputTokens ?? 0`
- `creationInputTokens = cache.creationInputTokens ?? 0`
- `inputTokens = cache.inputTokens ?? 0`
- `cacheableObserved = readInputTokens + creationInputTokens`
- `totalObservedInput = readInputTokens + creationInputTokens + inputTokens`
- `readRatio = readInputTokens / cacheableObserved` when `cacheableObserved > 0`
- `productionReadShare = readInputTokens / totalObservedInput` when `totalObservedInput > 0`
- `uncachedShare = inputTokens / totalObservedInput` when `totalObservedInput > 0`
- `costUsd` when Claude Code reports it
- `elapsedMs`
- whether nested `cacheCreation.ephemeral1hInputTokens` or `cacheCreation.ephemeral5mInputTokens` appeared
- `claude --version` for the cell; if it changes mid-protocol, restart the affected cell
- if `claude --version` is unavailable, record the path or install method and proceed

For `cacheTtl = "5m"`, ignore `cache.effective` and use raw token counts. `effective: "disabled"` only means the request did not ask for the 1-hour hint; it is not proof of the effective upstream TTL.

## Spend And Stop Rules

- Stop before packet-file experiments only if synthetic run 2 reports no cache token activity at all.
- Skip packet-file E2 if E3 passes and E0 finds no material reorder surface; E2 is mainly for diagnosing production-path weakness or harness/production disagreement.
- Treat synthetic-only failure as an observability failure, not a `dead-lever` conclusion.
- Stop before any reorder design if production path evidence passes under current packet order and E0 finds no substantial stable block stranded after churn.
- Keep new paid Claude Code calls for this protocol to the smallest set that can decide the branch. Target ceiling: 6 paid calls after protocol approval. Do not exceed 10 paid calls without a new explicit decision.
- Do not run 7+ minute TTL-boundary waits unless the immediate 1h/5m comparison is inconclusive and the branch decision depends on TTL duration rather than packet order.
- The only allowed extra experiment after an `inconclusive` result is one repeated E3 production pair with identical inputs, or one E1/E2 cell rerun with `--model opus --effort max`. Pick the cheaper one that addresses the observed gap.
- The E0-E4 budget does not include a future reorder quality baseline. If the branch becomes `reorder`, baseline and post-reorder comparison need a separate budget and implementation plan.

## Pre-registered Experiments

### E0: Packet-Order Audit

Inspect `src/review/packet.ts` and classify sections:

- Stable prefix: reviewer prompt, review instructions, packet trust boundary, task type label, reviewer output contract.
- Medium churn: original goal, acceptance criteria, review focus, Codex summary, known risks, tests run, current context.
- High churn: git status, routed git diff, untracked evidence, diagnostics.

Outcome fields:

- `stableAlreadyFrontLoaded`: true when reviewer prompt and trust boundary precede medium/high-churn material.
- `stablePrefixTokens`: estimated tokens before the first medium/high-churn block, using character count divided by 4 if no tokenizer is available.
- `largeStableBlockAfterHighChurn`: true only if a substantial stable instruction/contract block appears after git diff or untracked evidence.
- `stableBlocksInterleavedWithChurn`: true if stable instruction/contract text appears after any medium/high-churn block.
- `interleavedStableTokens`: estimated tokens in those interleaved stable blocks.
- `reorderSurface`: list of blocks that could move without changing semantics.

E0 must be completed before E1/E2/E3 because later branch decisions use its numbers.

Pre-paid E0 result on commit `1951145`:

- `stableAlreadyFrontLoaded`: true.
- `stablePrefixTokens`: approximately 398 tokens, estimated from 1,592 characters before the first medium/high-churn block.
- `largeStableBlockAfterHighChurn`: false.
- `stableBlocksInterleavedWithChurn`: true. The stable `Reviewer Output Contract` appears after medium-churn request fields and before git evidence.
- `interleavedStableTokens`: approximately 67 tokens, estimated from 266 characters.
- `reorderSurface`: `Reviewer Output Contract` could move earlier, but its estimated 67 tokens are below the 200-token materiality threshold.

These numbers depend on `src/review/packet.ts` and `src/review/prompts.ts` being unchanged from commit `1951145`. Re-run E0 if either file changes before execution.

### E1: Synthetic Harness Sanity

Run the prefix-changing cell:

```bash
npm run research:cache-repeat -- --model opus --effort max --tools default --runs 2 --stable-lines 200 --dynamic-mode suffix --cache-ttl 1h --timeout-ms 180000
```

Pass if run 2 has `readInputTokens > 0` and `readRatio >= 0.5`.

Weak-pass if run 2 has `readInputTokens > 0` but `readRatio < 0.5`; this disqualifies `dead-lever` but does not prove a clear synthetic positive.

Fail if run 2 has `readInputTokens = 0`. If this fails, do not call the cache lever dead; record that the synthetic harness cannot observe cache under this cell.

### E2: Packet-File Harness Sanity

Run E2 only if E3 is weak/failing or if the branch decision depends on packet-file harness evidence. Generate a preview packet and run:

```bash
node -e "require('fs').mkdirSync('tmp/cache-research',{recursive:true})"
node dist/index.js preview --task review_diff --context "Cache repeat research packet" --redact-secrets > tmp/cache-research/review-diff-clean-packet.md
node -e "const fs=require('fs'); const p='tmp/cache-research/review-diff-clean-packet.md'; console.log(Math.ceil(fs.readFileSync(p,'utf8').length/4))"
npm run research:cache-repeat -- --packet-file tmp/cache-research/review-diff-clean-packet.md --model opus --effort max --tools default --runs 2 --dynamic-mode suffix --cache-ttl 1h --timeout-ms 180000
```

The token-estimate command must print at least `5000` before paying for E2. If it is below that threshold, skip E2 and record it as too small to be useful.

Pass if run 2 has `readInputTokens > 0` and `readRatio >= 0.5`.

Fail if run 2 has `readInputTokens = 0`.

Do not commit the generated packet file.

The packet-file harness prompt is not byte-identical to production `cc_review`; E2 remains directional and E3 is the deciding production-path test. The E2 packet captures live git state at preview time unless the operator explicitly disables auto-discovery. Do not regenerate the file once both runs are complete; treat git state at preview time as part of the experiment record.

### E3: Production Path Paired Evidence

Run one dedicated pair of `cc_review` calls with identical inputs:

- `task: "review_doc"`
- same `cwd`
- same generated `context` containing at least 240 deterministic lines such as `E3 STATIC CACHE LINE 0001: Keep this line identical for the paired production-path cache test.`
- same `originalGoal`
- same `codexSummary`
- same `acceptanceCriteria`
- same `reviewFocus`
- same `knownRisks`
- same `testsRun`
- same `model`
- same `effort`
- same `cacheTtl`
- `autoDiscoverGit: false`
- `includeGitDiff: false`
- `includeGitStatus: false`
- `includeUntrackedContent: false`
- `prompt` unset
- `permissionMode: "bypassPermissions"`
- `tools: ["default"]`
- `output: "markdown"`
- `maxContextChars: 120000`
- `redactSecrets: false`
- `stream: true`
- `verbose: true`
- `includePartialMessages: true`
- `includeHookEvents: true`
- issue call 2 within 10 minutes of call 1

Use production-like defaults: `model: "opus"`, `effort: "max"`, `cacheTtl: "1h"`.

All other `CcReviewInput` fields must use schema defaults and must not be overridden between run 1 and run 2.

Pass if run 1 reports `creationInputTokens > 0`, run 2 reports `readInputTokens > 0`, and run 2 `readInputTokens >= 0.5 * run1.creationInputTokens`.

Weak-pass if run 2 reports reads but run 1 has no creation tokens because the cache was already warm; this supports cadence guidance but cannot by itself select `cadence-only`.

Fail if the second call reports `readInputTokens = 0`, or reports only negligible reads below the run-1-derived threshold.

If E3 fails while E1 or E2 passes, the result is `inconclusive`, not `reorder`, unless E0 also identifies a substantial reorder surface.

### E4: Optional 5m Immediate Comparison

Run only if E1/E2 pass and the branch decision depends on TTL rather than packet order:

```bash
npm run research:cache-repeat -- --runs 2 --stable-lines 200 --dynamic-mode suffix --cache-ttl 5m --timeout-ms 180000
```

This immediate comparison cannot prove TTL duration. It only checks whether not asking for the 1-hour hint changes short-interval reads or reported cache buckets. A default-TTL change requires a later TTL-boundary experiment crossing the 5-minute window.

## Decision Thresholds

Apply these after E0-E3, and E4 only if run.

### Branch: `dead-lever`

Choose `dead-lever` only if:

- E3 fails, and
- E2 fails or is unusable, and
- E1 fails or is unusable, and
- cache fields are absent or unusable enough that no trusted evidence source can observe repeat-call reads.

Action: document the negative result and pivot future optimization to effort/model/packet-size work.

### Branch: `cadence-only`

Choose `cadence-only` if:

- E3 passes under current packet order, and
- E0 reports `stableAlreadyFrontLoaded = true`, and
- E0 reports `largeStableBlockAfterHighChurn = false`, and
- either `stableBlocksInterleavedWithChurn = false` or `interleavedStableTokens < 200`.

Action: do not reorder. Document that current order already gets repeat-call cache reads and that the next low-churn improvement is user guidance for batching plan/diff review while cache is warm.

If E3 passes but `stableBlocksInterleavedWithChurn = true` and `interleavedStableTokens >= 200`, still do not reorder in this protocol. Record `cadence-only-with-surface-noted` and revisit only if future quality/cost evidence says the surface matters.

### Branch: `ttl-boundary-deferred`

Choose `ttl-boundary-deferred` if:

- E3 passes,
- E4 immediate 5-minute comparison, if run, shows reads comparable to 1-hour reads,
- and the remaining decision is whether the 1-hour write premium is worth it for reviews separated by more than 5 minutes.

Action: do not change defaults. A separate TTL-boundary experiment crossing the 5-minute window is required before any `cacheTtl` default or guidance change.

### Branch: `reorder`

Choose `reorder` only if all are true:

- E3 fails or is weak under current packet order.
- E1 and/or E2 passes, proving Claude Code can cache stable prompt-like or packet-like content in principle.
- E0 identifies either `largeStableBlockAfterHighChurn = true` or `stableBlocksInterleavedWithChurn = true` with `interleavedStableTokens >= 200`.
- A quality baseline exists for at least three representative review diffs before implementation.

Action: write a separate packet-order implementation plan. It must include preview tests, paired review-quality comparison, and `cc_review` diff review before merging.

### Branch: `inconclusive`

Choose `inconclusive` if:

- cache reads appear in some evidence but not enough to select a branch, or
- cost/read metrics conflict with quality or invocation-shape concerns.

Action: run at most one additional targeted experiment as defined in Spend And Stop Rules. If still inconclusive, stop and document the limit rather than broadening the matrix.

## Quality Baseline Requirement

Before any future reorder implementation, capture a baseline from three representative diffs:

- small mechanical source change,
- medium packet/routing change,
- security/config-sensitive change.

For each, preserve:

- review verdict,
- confirmed critical/major finding categories,
- whether the review cites concrete file or command evidence,
- ratio of material findings with concrete file/line references,
- `cache` fields,
- `costUsd`.

Quality is preserved only if post-reorder review surfaces the same critical/major finding categories and at least 80% of material findings keep concrete file, line, command, or diff evidence. Codex adjudicates the comparison and may request an additional `adversarial_review` if the paired reviews disagree.

## Result Recording

Write final findings to `docs/research/2026-05-15-repeat-call-cache.md`.

Do not store full packet contents, prompts, stderr text, or model output transcripts in committed research artifacts. Summaries may include token counts, cost, command shape, `claude --version`, and branch decision.
