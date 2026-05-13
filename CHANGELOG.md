# Changelog

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
