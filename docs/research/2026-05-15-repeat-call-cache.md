# Repeat-Call Cache Research Results

Date: 2026-05-15

Baseline:

- Foundation commit: `1951145` (`feat: add cache repeat research foundation`)
- Protocol commit: `40361c5` (`docs: add repeat cache research protocol`)
- Claude Code version: `2.1.140`
- Verification before research: `npm run verify:release` passed on the foundation commit.

## Decision

Do not implement packet reorder for repeat-call cost optimization.

The research found repeatable cache reads, but the reads appear to come from Claude Code's stable wrapper/tool prefix rather than from `codex-cc-reviewer` packet, stdin, prompt, or context content. Repeated calls still create roughly the same number of 1-hour cache tokens and do not show material cost reduction.

Branch: `dead-lever` for packet reorder as a cost lever.

Follow-up direction: pivot future cost work to packet-size reduction, evidence routing selectivity, effort/model policy, or review workflow guidance. Do not spend implementation effort on packet section reorder unless future Claude Code behavior shows user packet content itself becoming cache-readable.

## E0 Packet-Order Audit

Static audit of `src/review/packet.ts` and `src/review/prompts.ts`:

- Stable prefix is already front-loaded: reviewer prompt, review instructions, trust boundary, and task type precede medium/high-churn evidence.
- Estimated stable prefix before the first medium/high-churn block: 1,592 chars, approximately 398 tokens.
- Stable block after high-churn evidence: none.
- Stable block interleaved after medium-churn evidence: `Reviewer Output Contract`.
- Estimated interleaved stable block size: 266 chars, approximately 67 tokens.
- Material reorder surface: none. The only movable stable block is below the 200-token materiality threshold.

## E1 Synthetic Harness, Stdin Stable Content

Command shape:

```bash
npm run research:cache-repeat -- --model opus --effort max --tools default --runs 2 --stable-lines 200 --dynamic-mode suffix --cache-ttl 1h --timeout-ms 180000
```

Results:

| Run | inputTokens | creationInputTokens | readInputTokens | ephemeral1hInputTokens | costUsd |
| --- | ---: | ---: | ---: | ---: | ---: |
| run-1 | 6 | 23503 | 22717 | 23503 | 0.15843225 |
| run-2 | 6 | 23506 | 22717 | 23506 | 0.158451 |

Interpretation:

- Run 2 had cache reads, so the harness can observe cache fields.
- Run 2 still created the same order of 1-hour cache tokens.
- Cost did not improve.
- This is a weak-pass for cache observability, not evidence that stdin stable content is reused.

## E3 Production Runner Pair

Executor:

- Local `node dist/index.js review`, which uses the same `runClaudeReview`, `buildReviewPacket`, and Claude runner path as the MCP `cc_review` tool.
- `task: review_doc`
- deterministic 240-line context block
- git auto-discovery disabled
- model `opus`, effort `max`, tools `default`, cache TTL hint `1h`

One earlier E3 call executed with an output-filtering mistake and is excluded from metrics.

Results from the valid `E3B` pair:

| Run | inputTokens | creationInputTokens | readInputTokens | ephemeral1hInputTokens | costUsd |
| --- | ---: | ---: | ---: | ---: | ---: |
| run-1 | 5 | 25002 | 22717 | 25002 | 0.210496 |
| run-2 | 5 | 25002 | 22717 | 25002 | 0.228046 |

Interpretation:

- The fixed read-token count appeared on both runs.
- The deterministic 240-line context still created 25,002 1-hour cache tokens on both runs.
- Run 2 did not convert the context creation tokens into read tokens.
- Cost did not improve.
- The most likely explanation is that Claude Code cached its own stable wrapper/tool prefix, while the user-supplied packet/context content remained a repeated cache write.

## Targeted Prompt-Location Control

Command shape:

```bash
npm run research:cache-repeat -- --model opus --effort max --tools default --runs 2 --stable-lines 200 --stable-location prompt --dynamic-mode suffix --cache-ttl 1h --timeout-ms 180000
```

Results:

| Run | inputTokens | creationInputTokens | readInputTokens | ephemeral1hInputTokens | costUsd |
| --- | ---: | ---: | ---: | ---: | ---: |
| run-1 | 6 | 23484 | 22717 | 23484 | 0.1583135 |
| run-2 | 6 | 23482 | 22717 | 23482 | 0.158301 |

Interpretation:

- Moving synthetic stable text from stdin to the `-p` prompt argument did not change the pattern.
- Read tokens stayed fixed and creation tokens repeated.
- Prompt-argument placement is not evidence for a cheap packet reorder path.

## E4 Immediate 5m Comparison

Command shape:

```bash
npm run research:cache-repeat -- --model opus --effort max --tools default --runs 2 --stable-lines 200 --dynamic-mode suffix --cache-ttl 5m --timeout-ms 180000
```

Results:

| Run | inputTokens | creationInputTokens | readInputTokens | ephemeral1hInputTokens | ephemeral5mInputTokens | costUsd |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| run-1 | 6 | 23506 | 22717 | 23506 | 0 | 0.158451 |
| run-2 | 6 | 23505 | 22717 | 23505 | 0 | 0.15844475 |

Interpretation:

- `cacheTtl=5m` did not produce reported 5-minute cache buckets in this environment.
- Claude Code still reported 1-hour cache creation tokens.
- Treat `cacheTtl=5m` as "the tool did not ask for the 1-hour hint", not proof that upstream avoided 1-hour cache activity.
- No default TTL change is justified from this evidence.

## Conclusion

The core repeat-call cache optimization hypothesis was:

> Reordering the packet so stable prompt/trust-boundary/output-contract content comes earlier will improve 1-hour cache hits and reduce repeated review cost.

The evidence does not support that hypothesis:

- Most stable instruction content is already before churn.
- The only interleaved stable contract block is too small to matter.
- Synthetic stdin content, synthetic prompt-argument content, and production runner context content all showed repeated cache creation rather than conversion to cache reads.
- The fixed cache reads likely come from Claude Code's own stable wrapper/tool prefix, not the review packet body.
- Repeated calls did not materially reduce cost in the measured cells.

Do not implement packet reorder for repeat-call cost. Keep the observability instrumentation and benchmark harness for future Claude Code behavior changes, but close this optimization theme for now.
