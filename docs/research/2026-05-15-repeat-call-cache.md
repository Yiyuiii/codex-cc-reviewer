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

## Exact-Repeat Follow-up

Purpose:

- Close the remaining black-box gap from the first pass: earlier synthetic runs changed the dynamic suffix, so they did not prove what happens when user-controlled content is byte-identical across repeated calls.
- Avoid contamination from prior 1-hour cache entries by adding a fresh lowercase base36 `--stable-tag` to generated synthetic lines.
- Record only token and cost summaries. No prompt, stdin, stdout result text, stderr body, or packet body is committed.
- The stable tag table values are random, non-sensitive cache-bust markers. They are the only stdin- or prompt-embedded literals recorded from these synthetic experiments.

Environment and controls:

- Claude Code version: `2.1.140`
- `claude -p --help` says `--tools default` uses all built-in tools and `--tools ""` disables all tools.
- The harness uses `--no-session-persistence`; observed cache reads are therefore upstream prompt-cache behavior, not local Claude Code session resume.
- Exact-repeat cells use `--dynamic-mode same`. Their run-1 numbers are compared only against their own run-2 numbers, not against earlier `--dynamic-mode suffix` cells.
- Anthropic's prompt caching documentation describes cache reads/creation as stable-prefix behavior around explicit cache breakpoints, but Claude Code does not expose its internal breakpoint placement. This follow-up remains a Claude Code black-box test. See [Anthropic prompt caching docs](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching).

Decision thresholds:

- User-content conversion ratio: `(run1.creationInputTokens - run2.creationInputTokens) / run1.creationInputTokens`.
- Major finding: conversion >= 50%.
- Weak finding: conversion >= 10% and < 50%.
- Noise/fail: conversion < 10%, creation unchanged within 5%, or creation increases.
- Tool-prefix classification: warmed `readInputTokens` movement >= 30% or >= 5,000 tokens across tool sets is material; < 10% is treated as tool-independent; between those is inconclusive.

Exact-repeat stdin results:

| Pair | Stable tag | Run | stableLines | creationInputTokens | readInputTokens | conversion vs run-1 | costUsd |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| A1 | `fbc4d79cb02827a0` | run-1 | 200 | 26129 | 22717 | n/a | 0.17484475 |
| A1 | `fbc4d79cb02827a0` | run-2 | 200 | 26126 | 22717 | 0.01% | 0.174826 |
| A2 | `8fe0299b1391d1fd` | run-1 | 200 | 26129 | 22717 | n/a | 0.17484475 |
| A2 | `8fe0299b1391d1fd` | run-2 | 200 | 26126 | 22717 | 0.01% | 0.174826 |

Exact-repeat prompt-argument results:

| Pair | Stable tag | Run | stableLines | creationInputTokens | readInputTokens | conversion vs run-1 | costUsd |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| B1 | `3ce98554178218a5` | run-1 | 200 | 25713 | 22717 | n/a | 0.17224475 |
| B1 | `3ce98554178218a5` | run-2 | 200 | 25713 | 22717 | 0.00% | 0.17224475 |
| B2 | `38cfd53b63ee1bee` | run-1 | 200 | 26118 | 22717 | n/a | 0.174776 |
| B2 | `38cfd53b63ee1bee` | run-2 | 200 | 26119 | 22717 | -0.00% | 0.17478225 |

Tool-prefix classification results:

| Cell | Tools | Stable tag | Run | stableLines | creationInputTokens | readInputTokens | costUsd |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| C1 | `Read` | `ca960d5959ec2ac8` | run-1 | 200 | 34910 | 0 | 0.2183675 |
| C1 | `Read` | `ca960d5959ec2ac8` | run-2 | 200 | 21821 | 13091 | 0.14310675 |
| C2 | `Read` | `28098b5f5867e921` | run-1 | 1 | 12666 | 13091 | 0.085888 |
| C2 | `Read` | `28098b5f5867e921` | run-2 | 1 | 12664 | 13091 | 0.0858755 |
| C3 | `""` | `6b5fcdb7622324f7` | run-1 | 1 | 24852 | 0 | 0.155505 |
| C3 | `""` | `6b5fcdb7622324f7` | run-2 | 1 | 12668 | 12185 | 0.0854475 |
| C4 | `default` | `e05e18c6a940a820` | run-1 | 1 | 16971 | 22717 | 0.11760725 |
| C4 | `default` | `e05e18c6a940a820` | run-2 | 1 | 16971 | 22717 | 0.11760725 |

Interpretation:

- Fresh-tag, byte-identical stdin content failed twice: creation changed by only 3 tokens on both pairs, about 0.01%.
- Fresh-tag, byte-identical prompt-argument content also failed twice: creation was unchanged or increased by 1 token.
- The `Read` tool cell warmed from `0` read tokens to `13091` read tokens, but the same `13091` read-token block persisted when stable user content was reduced to 1 line.
- C2 used a fresh tag after C1 but started with the same `13091` read-token block; that cross-tag reuse is the strongest evidence that the cached block is the Claude Code wrapper/tool prefix, not the synthetic user content.
- Empty tools warmed to `12185` read tokens with only 1 stable line. `Read` adds about `906` warmed read tokens over that base. `default` showed `22717` read tokens even with only 1 stable line.
- The default-vs-empty warmed read delta is `10532` tokens, and default-vs-Read is `9626` tokens. Both exceed the material movement threshold.

Follow-up conclusion:

- Exact-repeat user-controlled content did not produce observable cache-read conversion in either stdin or prompt-argument placement.
- The observed cache savings are dominated by Claude Code's stable prefix and tool catalog, not by `codex-cc-reviewer` packet section order.
- Keeping model, effort, permission mode, and tool set stable is useful because it preserves prefix-cache reuse. Reordering packet sections is still a dead lever for repeat-call cost in Claude Code `2.1.140`.
- Remaining cache-mechanism research requires one of: a future Claude Code version that exposes user-content cache hits or changes breakpoint behavior; external HTTP/request-capture capability that can inspect Claude Code cache-control placement; or a direct Anthropic SDK experiment with explicit `cache_control` breakpoints, which exits the Claude Code black-box path.

## Append-System And Tool-Selective Follow-up

Purpose:

- Test whether stable reviewer instructions become cache-useful when moved from stdin packet content into Claude Code `--append-system-prompt`.
- Test whether a read-only tool profile can materially reduce Claude Code's cached tool-prefix footprint while still finding a call-site-sensitive regression in a sanity fixture.
- Keep production behavior unchanged. The only implementation change in this pass is maintainer research harness support for append-system experiments.

Plan-review controls:

- Two `cc_review review_plan` passes were run before the harness change.
- Accepted blockers changed the protocol to use exact-repeat as the primary append-system signal, pair append-system with `--exclude-dynamic-system-prompt-sections`, use at least two fresh-tag pairs, reject packet-file plus append-system, define the append-system dynamic suffix wiring, and cap generated append-system argv content.
- Local Claude Code `2.1.140` help confirmed:
  - `--append-system-prompt <prompt>` appends to the default system prompt.
  - `--exclude-dynamic-system-prompt-sections` is a no-value flag that moves per-machine default-system sections into the first user message and is ignored with `--system-prompt`.
- In append-system mode, the synthetic stable body is intentionally placed in argv because that is how Claude Code accepts `--append-system-prompt`. The body is generated non-sensitive test text; summaries and committed docs record only tag, byte count, and token/cost metrics.
- Because append-system mode uses argv, do not use it with sensitive real prompts on shared machines or anywhere process listings may be visible to other users.

Append-system wiring:

- `--append-system-prompt`: synthetic stable text.
- `stdin`: only `DYNAMIC_SUFFIX: <suffix>` and `Return exactly: OK`.
- `-p`: unchanged harness instruction, `Answer the request provided on stdin. Do not use tools.`
- Generated append-system body cap: 20 KiB, to stay below Windows command-line limits with headroom.

Decision thresholds:

- Reuse the prior exact-repeat thresholds: major >= 50% creation-token conversion, weak >= 10% and < 50%, fail/noise < 10%, creation unchanged within 5%, or creation increases.
- Gating field: `usage.creationInputTokens` (`cache_creation_input_tokens`). `cacheCreation.ephemeral1hInputTokens` is also reported when present.
- Any mixed result would trigger more fresh-tag pairs. Only all-fail warmed pairs close the append-system cache lever.

Append-system primary cell:

Command shape:

```bash
npm run research:cache-repeat -- --model opus --effort max --tools default --stable-lines 200 --stable-location append-system --stable-tag <fresh> --dynamic-mode same --cache-ttl 1h --runs 2 --timeout-ms 180000 --exclude-dynamic-system-prompt-sections
```

Results:

| Pair | Start UTC | Stable tag | Run | appendSystemPromptBytes | creationInputTokens | readInputTokens | ephemeral1hInputTokens | conversion vs run-1 | costUsd |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| AS1 | 2026-05-15T03:52:25Z | `4173c00e11fe6dd0` | run-1 | 17799 | 49083 | 0 | 49083 | n/a | 0.30694875 |
| AS1 | 2026-05-15T03:52:25Z | `4173c00e11fe6dd0` | run-2 | 17799 | 22413 | 26669 | 22413 | 54.34%* | 0.15359575 |
| AS2 | 2026-05-15T03:53:14Z | `77ed39cc7ebb84fd` | run-1 | 17799 | 22412 | 26669 | 22412 | n/a | 0.15358950 |
| AS2 | 2026-05-15T03:53:14Z | `77ed39cc7ebb84fd` | run-2 | 17799 | 22413 | 26669 | 22413 | -0.00% | 0.15359575 |
| AS3 | 2026-05-15T03:54:09Z | `918e2a31e3f2cd9a` | run-1 | 17799 | 22410 | 26669 | 22410 | n/a | 0.15357700 |
| AS3 | 2026-05-15T03:54:09Z | `918e2a31e3f2cd9a` | run-2 | 17799 | 22412 | 26669 | 22412 | -0.01% | 0.15358950 |

The byte counts above reflect 16-character base36 tags in the measured runs; shorter tags produce slightly smaller synthetic bodies.

Interpretation:

- AS1 looked like a major finding at first, but AS2 changed the interpretation: AS2 run-1 used a fresh tag yet already had the same `26669` read-token block and the same low creation range.
- `*` AS1's apparent conversion is wrapper warm-up; AS2 run-1 reproduced the same low creation range with a fresh tag before its own run-2.
- Therefore AS1 mostly measured the new `append-system + exclude-dynamic` wrapper shape warming from cold to warm. It did not prove the append-system body itself became cache-readable.
- AS2 and AS3 are the decisive warmed exact-repeat controls. Their creation tokens did not drop on run 2 even though append-system content was byte-identical within each pair.
- `--exclude-dynamic-system-prompt-sections` changes the reusable Claude Code prefix shape: warmed read tokens were `26669`, compared with the earlier default-tools warmed prefix of `22717`.
- Do not move `REVIEWER_PROMPT` to `--append-system-prompt` for repeat-call cost. Prompt placement may still be worth a separate instruction-hierarchy or prompt-injection study, but this cache study does not justify it.

Tool-selective prefix classification:

New cells only. Prior baselines from the Exact-Repeat Follow-up remain:

- empty tools: warmed `12185` read tokens
- `Read`: warmed `13091` read tokens
- `default`: warmed `22717` read tokens

New results:

| Cell | Start UTC | Tools | Stable tag | Run | stableLines | creationInputTokens | readInputTokens | ephemeral1hInputTokens | costUsd |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| TS1 | 2026-05-15T03:54:53Z | `Read,Grep,Glob` | `1615f15cdda31385` | run-1 | 1 | 27450 | 0 | 27450 | 0.17174250 |
| TS1 | 2026-05-15T03:54:53Z | `Read,Grep,Glob` | `1615f15cdda31385` | run-2 | 1 | 12658 | 14790 | 12658 | 0.08668750 |
| TS2 | 2026-05-15T03:55:32Z | `Grep,Glob` | `69d4839bb1c0dc96` | run-1 | 1 | 24763 | 0 | 24763 | 0.15699875 |
| TS2 | 2026-05-15T03:55:32Z | `Grep,Glob` | `69d4839bb1c0dc96` | run-2 | 1 | 26547 | 0 | 26547 | 0.16609875 |

Interpretation:

- `Read,Grep,Glob` warmed to `14790` read tokens, which is `7927` fewer than `default` and `1699` more than `Read` alone.
- The `default` versus `Read,Grep,Glob` delta exceeds the material movement threshold. This is a real cost surface for an opt-in read-only profile.
- `Grep,Glob` without `Read` did not show cache reads in this two-run cell and is not a credible review profile by itself.
- Without `Read`, the reviewer cannot pull full file contents beyond grep snippets, so cross-function reasoning and call-site verification would regress.
- This classification does not prove review quality. It only says a read/search-only profile can reduce Claude Code's cached tool-prefix footprint relative to `default`.

Tool-selective fixture sanity check:

Fixture:

- Temporary ignored path: `tmp/fixture-tools-narrowing`
- Diff changed `parseReportLimit(undefined | "")` from returning `undefined` to returning `0`.
- The regression requires inspecting the caller: `buildReport` passes the value to `items.slice(0, limit)`, so `undefined` means all items and `0` means no items.
- `npm test` in the fixture failed as expected: actual `[]`, expected `["a", "b"]`.

Review runs:

| Profile | Tools | maxContextChars | Result | Tool activity | cache read tokens | costUsd |
| --- | --- | ---: | --- | --- | ---: | ---: |
| read-only sanity | `Read,Grep,Glob` | 1200 | Found blocker regression | Used `Glob`, `Read`, and `Grep` to inspect caller and test | 99466 | 0.258273 |
| default sanity | `default` | 1200 | Found blocker regression | Used `Read` and `Bash` | 62457 | 0.2518335 |

Interpretation:

- The read-only profile passed this no-regression sanity fixture: it used search/read tools and found the same seeded call-site regression as default tools.
- This is not statistical proof that read-only review quality matches default. It is only evidence that `Read,Grep,Glob` is capable of the intended manifest-plus-tool workflow on a small call-site-sensitive case.
- The fixture's net cost did not favor read-only: read-only cost `$0.258273` versus default `$0.2518335`, because tool round-trips outweighed the smaller minimal prefix in this small case. Treat the prefix delta as a workload-dependent opportunity, not a guaranteed cost reduction.
- The default profile remains better for high-risk reviews that need Bash, tests, generated commands, or broader investigation.

Follow-up conclusion:

- Append-system prompt placement is a dead lever for repeat-call cache/cost in Claude Code `2.1.140`, even with `--exclude-dynamic-system-prompt-sections`.
- `--exclude-dynamic-system-prompt-sections` itself changes the reusable wrapper prefix and may be worth future cross-workspace cache research, but it does not make user-controlled append-system content cache-readable in this path.
- A read-only profile using `Read,Grep,Glob` has a material minimal-prefix token advantage over `default`, but net review cost is workload-dependent. In the fixture sanity check it found the same seeded blocker while costing slightly more than default.
- Do not implement a production prompt-placement change from this evidence.
- Reopen prompt-placement cache research only if a future Claude Code version exposes cache-control placement, changes append-system cache behavior, or supports passing appended system prompt content outside argv with explicit cache diagnostics.

## Conclusion

The core repeat-call cache optimization hypothesis was:

> Reordering the packet so stable prompt/trust-boundary/output-contract content comes earlier will improve 1-hour cache hits and reduce repeated review cost.

The evidence does not support that hypothesis:

- Most stable instruction content is already before churn.
- The only interleaved stable contract block is too small to matter.
- Synthetic stdin content, synthetic prompt-argument content, and production runner context content all showed repeated cache creation rather than conversion to cache reads.
- Fresh-tag exact-repeat controls confirmed the same pattern for byte-identical stdin and prompt-argument user content.
- The fixed cache reads scale materially with Claude Code's tool set: empty tools warmed to 12,185 read tokens, `Read` to 13,091, and `default` to 22,717.
- The fixed cache reads come from Claude Code's own stable wrapper/tool prefix, not the review packet body.
- Moving synthetic stable content to `--append-system-prompt` did not make that content cache-readable after the Claude Code wrapper was warm.
- `Read,Grep,Glob` materially reduces the cached tool-prefix footprint versus `default` and passed a small call-site-regression sanity fixture, but the fixture's net cost was not lower in the single sanity run. This makes an opt-in read-only profile the best remaining product candidate to evaluate, not a proven cost reduction.
- Repeated calls did not materially reduce cost in the measured cells.

Do not implement packet reorder or append-system prompt placement for repeat-call cost. Keep the observability instrumentation and benchmark harness for future Claude Code behavior changes. If product work continues, prioritize an opt-in read-only/reduced-tools profile and evaluate it as a quality/capability tradeoff, not as a cache-mechanism change.
