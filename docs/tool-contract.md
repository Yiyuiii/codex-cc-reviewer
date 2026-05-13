# Tool Contract

## `cc_review`

Runs Claude Code as an external reviewer.

Input:

- `task`: `review_plan`, `review_diff`, `review_doc`, or `adversarial_review`
- `context`: required review context
- `prompt`: optional extra goal
- `model`: default `opus`
- `effort`: default `max`
- `output`: `markdown` or `json`
- `permissionMode`: `acceptEdits`, `auto`, `bypassPermissions`, `default`, `dontAsk`, or `plan`; default `bypassPermissions`
- `tools`: string or array; default `["default"]`
- `maxTurns`: default `8`
- `maxBudgetUsd`: optional
- `cwd`: optional working directory
- `includeGitDiff`: default `false`
- `includeGitStatus`: default `false`
- `stream`: default `true`; uses Claude Code `stream-json`
- `includePartialMessages`: default `true`
- `includeHookEvents`: default `true`
- `verbose`: default `true`
- `cacheTtl`: `5m` or `1h`; default `1h`
- `redactSecrets`: default `false`; set `true` for best-effort redaction

Output:

- `ok`
- `task`
- `model`
- `elapsedMs`
- `review`
- `structured`
- `command`
- `eventsTail`
- `transcriptTail`
- `eventCount`
- `cache`
- `costUsd`
- `stderrTail`
- `exitCode`

MCP tool calls still return once after Claude Code exits. Streaming is captured and summarized in the final result; real-time MCP progress notifications are not implemented yet.
