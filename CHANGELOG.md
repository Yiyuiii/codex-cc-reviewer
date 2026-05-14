# Changelog

## 0.3.1

- Promote `v0.3.1-rc.0` after validating the published npm `next` package in a restarted local Codex session.
- Confirm the post-restart `review_diff` smoke exercised tracked diff routing, selected untracked text evidence, and best-effort redaction.
- Keep the documented GitHub Actions Trusted Publishing flow as the only real npm publication path; local npm publishing remains dry-run verification only.

## 0.3.1-rc.0

- Add raw fallback evidence for non-empty git diffs that cannot be parsed into per-file `diff --git` blocks, preventing silent loss of review evidence.
- Add packet diagnostics for non-empty unparseable git diffs and partially dropped diff blocks without echoing raw diff content into diagnostics.
- Render unparseable diff fallback evidence as text and escape manifest change-summary cells consistently.
- Fix security and README docs drift around `0.3.x` status and diff-oriented git evidence defaults.
- Require local Codex `review_diff` smoke coverage for future releases whose headline behavior changes diff routing or packet evidence.

## 0.3.0

- Promote Review Evidence Routing after validating `v0.3.0-rc.0` in a restarted local Codex session.
- Keep `claude -p` as the supported review backend while retaining the maintainer-only background-mode research harness.
- Include the doctor hardening and release validation evidence from the `0.3.0` release candidate.

## 0.3.0-rc.0

This release candidate intentionally validates three bundled areas before stable promotion:
Review Evidence Routing, doctor hardening, and the maintainer background-mode research harness.

- Upgrade note: `review_diff` and `adversarial_review` now embed selected untracked text file bodies by default when git auto-discovery is enabled. This can include local files such as `.env`, `.env.local`, `*.pem`, `id_rsa*`, `kubeconfig`, `.aws/credentials`, or debug dumps when they are untracked and not ignored. Set `includeUntrackedContent: false` to keep untracked files path-only, or set `redactSecrets: true` for best-effort content redaction.
- Keep `claude -p` as the supported review backend after validating that `claude --bg` can review but does not yet provide an equally stable full-result surface.
- Add non-fatal `doctor` warnings for Claude Code versions below the validated floor, daemon workers started on a different Claude Code version, and blocked background jobs.
- Add a maintainer-only `npm run research:bg-ab` harness for future Plan-profile A/B validation of `claude -p` versus `claude --bg`.
- Add Review Evidence Routing for diff-oriented reviews: risk-priority tracked diff routing, selected untracked text bodies by default, transparent tracked/untracked manifests, and review-quality filters for binary/generated/build/dependency evidence.
- Add `includeUntrackedContent` and `codex-cc-reviewer preview` so users can disable untracked body embedding or inspect the exact review packet without starting Claude Code.

## 0.2.3

- Promote release assurance hardening after validating `v0.2.3-rc.0` in a restarted local Codex session.
- Add standard release preflight scripts covering typecheck, tests, build, npm pack dry-run, and CLI smoke checks.
- Harden CI with concurrency cancellation, job timeout, pack/CLI smoke checks, npm pack manifest validation, and short-lived package evidence artifacts.
- Harden release publishing with package-version/tag matching, CRLF-tolerant stable local Codex validation evidence, npm publish verification, and GitHub Release creation.
- Document required `testsRun`, `codexSummary`, and `knownRisks` evidence before final `cc_review` diff reviews.

## 0.2.3-rc.0

- Add release assurance hardening for CI, npm package verification, release publishing, and local Codex validation evidence.
- Publish this prerelease to npm `next` for real Codex restart validation before stable promotion.

## 0.2.2

- Promote `install --package-spec <spec>` after validating `0.2.2-rc.0` in a restarted local Codex session.
- Support configuring Codex to load prerelease MCP packages such as `codex-cc-reviewer@next`.
- Show non-default configured MCP package specs in `doctor` output.

## 0.2.2-rc.0

- Add `install --package-spec <spec>` so prerelease validation can point Codex at `codex-cc-reviewer@next`.
- Show the configured MCP package spec in `doctor` output when it can be detected.
- Document the local Codex rc validation flow before stable promotion.

## 0.2.1

- Promote the branch-aware release workflow after validating `v0.2.1-rc.0` on npm `next`.
- Publish stable tags from `main` to npm `latest` with GitHub Actions OIDC Trusted Publishing provenance.
- Keep prerelease validation on `next` before stable promotion.

## 0.2.1-rc.0

- Add the `next` prerelease branch workflow for validating npm Trusted Publishing before stable releases.
- Route prerelease tags such as `v0.2.1-rc.0` to the npm `next` dist-tag.
- Add release workflow channel resolution, tag-trigger guard, branch ancestry checks, and explicit npm provenance publishing.

## 0.2.0

- Add git diff parsing and context routing for diff-oriented reviews.
- Replace monolithic diff packet insertion with `Changed Files Manifest`, `Context Routing Guidance`, and `Routed Git Diff Evidence`.
- Include small source diffs fully, include large source diffs partially with head/tail preservation, and omit binary/generated/lockfile/build-output diffs from embedded bodies while keeping them visible in the manifest.
- Preserve the deep Claude Code defaults from 0.1.6: `opus`, `max`, dangerous trusted-local permission mode, default tools, no cost cap, and no turn cap.
- Document the Codex/Claude tradeoff: Codex sends a reliable map plus selected evidence; Claude Code inspects partial or omitted files when needed.

## 0.1.6

- Remove public `maxTurns` and `maxBudgetUsd` review caps; `cc_review` no longer forwards Claude Code cost or turn limits.
- Make `cc_review` input strict so removed or unknown fields fail loudly instead of being silently ignored.
- Add lightweight Git Evidence Summary with diff stat, name-status, and untracked manifest.
- Truncate oversized review packet blocks from the middle, preserving both the beginning and end.
- Document timeout as service hang protection rather than a model capability limit.

## 0.1.5

- Stop passing a default Claude Code `--max-turns` limit.
- Keep `maxTurns` available as an explicit budget-control option.
- Document that turn limits are opt-in because review turns can be small exploratory actions.

## 0.1.4

- Add structured packet fields for original goal, review focus, Codex summary, acceptance criteria, known risks, and tests run.
- Treat `prompt` as a backward-compatible alias for `reviewFocus`.
- Auto-discover git evidence for `review_diff` and `adversarial_review`.
- Include staged tracked changes by switching diff collection to `git diff --no-ext-diff HEAD`.
- Switch status collection to `git status --porcelain=v2`.
- Add packet diagnostics when diff review discovers no git evidence.
- Extend JSON review schema with optional evidence, impact, confidence, blocking, and verification fields.

## 0.1.3

- Fix real Claude Code execution with execa v9 by mapping internal cancellation signals to `cancelSignal`.
- Add a regression test for the execa option mapping.

## 0.1.2

- Add structured Claude Code activity timeline output.
- Add MCP progress notifications when the client provides a `progressToken`.
- Add cache effective diagnostics for hit, cold write, disabled, and unreported states.
- Stream Claude Code stdout through an incremental parser while preserving buffered fallback tests.
- Wire MCP cancellation signals into Claude Code execution.
- Document progress-token and cache-reporting limitations.

## 0.1.1

- Preserve review packet text by default; redaction is opt-in.
- Add transcript snippets from Claude Code stream output.
- Change generated Codex config to `required = false`.
- Improve English and Chinese README pages with language links.
- Explicitly ask Claude to include the complete review in the final response.

## 0.1.0

- Initial MCP stdio server with `cc_review`.
- Claude Code headless runner.
- Local `review` CLI command.
- `install`, `uninstall`, and `doctor` commands.
- Default deep autonomous review: `opus`, `max`, `bypassPermissions`, `default` tools.
- Stream-json activity capture in final review output.
- 1-hour prompt cache TTL hint.
- Raw packet transmission by default; redaction is opt-in.
- Codex install config uses `required = false`.
