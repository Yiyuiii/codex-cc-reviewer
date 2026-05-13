# Tool Contract

## `cc_review`

Runs Claude Code as an external reviewer.

Input:

- `task`: `review_plan`, `review_diff`, `review_doc`, or `adversarial_review`
- `context`: required review context
- `originalGoal`: optional original user goal or acceptance context
- `acceptanceCriteria`: optional string or array of acceptance criteria
- `reviewFocus`: optional focus for this review run
- `prompt`: backward-compatible alias for `reviewFocus`
- `codexSummary`: optional Codex implementation summary
- `knownRisks`: optional string or array of risks Codex already knows about
- `testsRun`: optional string or array of verification commands/results already run
- `model`: default `opus`
- `effort`: default `max`
- `output`: `markdown` or `json`
- `permissionMode`: `acceptEdits`, `auto`, `bypassPermissions`, `default`, `dontAsk`, or `plan`; default `bypassPermissions`
- `tools`: string or array; default `["default"]`
- `cwd`: optional working directory
- `includeGitDiff`: default `false`
- `includeGitStatus`: default `false`
- `autoDiscoverGit`: optional. When omitted, the packet includes lightweight git summary evidence. `review_diff` and `adversarial_review` also include raw git status and diff evidence.
- `stream`: default `true`; uses Claude Code `stream-json`
- `includePartialMessages`: default `true`
- `includeHookEvents`: default `true`
- `verbose`: default `true`
- `cacheTtl`: `5m` or `1h`; default `1h`
- `redactSecrets`: default `false`; set `true` for best-effort redaction
- `maxContextChars`: optional integer, min `1000`, max `1000000`, default `120000`; controls the budget for variable review packet blocks

Unknown input keys are rejected. Removed cost and turn cap fields such as `maxBudgetUsd` and `maxTurns` fail validation instead of being silently ignored.

The runner keeps a 15-minute timeout to prevent hung service calls. This timeout is operational protection, not a Claude Code capability cap.

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
- `activityTail`
- `eventCount`
- `cache`
- `costUsd`
- `diagnostics`
- `stderrTail`
- `exitCode`

While the tool is running, the server sends MCP `notifications/progress` when the client includes `_meta.progressToken` in the tool call request. Progress values are monotonically increasing event counters and `message` contains a concise Claude Code activity summary. If the client does not provide a progress token, no real-time notification can be sent; the final result includes `diagnostics` explaining that limitation.

`cache.effective` is derived from Claude Code's reported usage fields:

- `hit`: `cache_read_input_tokens` was greater than zero.
- `write`: cache creation tokens were reported without read tokens.
- `miss_or_unreported`: Claude Code did not report cache usage or reported zero cache tokens.
- `disabled`: the request used `cacheTtl = "5m"` and did not request the 1-hour cache hint.

These diagnostics reflect Claude Code CLI output, not direct Anthropic API state.

For automatic git evidence, the Git Evidence Summary includes `git diff --stat HEAD`, `git diff --name-status HEAD`, and `git ls-files --others --exclude-standard`. `getGitStatus` uses `git status --porcelain=v2` and `getGitDiff` uses `git diff --no-ext-diff HEAD`, so staged and unstaged tracked changes are included. Untracked file content and multi-section diff manifests are not part of the current contract yet.

Review packet blocks use a large context budget by default. Oversized blocks are truncated from the middle with a marker while preserving both the beginning and the end.
