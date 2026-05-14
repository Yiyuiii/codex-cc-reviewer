# Tool Contract

## `cc_review`

Runs Claude Code as an external reviewer through print mode (`claude -p`). The supported backend does not use Claude Code background sessions / Agent View because the stable `-p` path returns the full structured result directly.

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
- `includeUntrackedContent`: optional. When omitted, `review_diff` and `adversarial_review` include selected untracked text file bodies when git auto-discovery is enabled. `review_plan` and `review_doc` do not embed untracked bodies by default.
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

`cache` fields are optional and reflect what Claude Code reported in its `usage` object:

- `inputTokens`: Claude Code's reported residual uncached input tokens (`input_tokens`), not total input tokens.
- `creationInputTokens`: aggregate cache creation tokens (`cache_creation_input_tokens`).
- `readInputTokens`: cache read tokens (`cache_read_input_tokens`).
- `cacheCreation.ephemeral1hInputTokens`: 1-hour cache creation tokens when Claude Code reports `cache_creation.ephemeral_1h_input_tokens`.
- `cacheCreation.ephemeral5mInputTokens`: 5-minute cache creation tokens when Claude Code reports `cache_creation.ephemeral_5m_input_tokens`.

`cache.effective` is derived from Claude Code's reported usage fields:

- `hit`: `cache_read_input_tokens` was greater than zero.
- `write`: cache creation tokens were reported without read tokens.
- `miss_or_unreported`: Claude Code did not report cache usage or reported zero cache tokens.
- `disabled`: the request used `cacheTtl = "5m"` and did not ask for the 1-hour cache hint.

`disabled` means the tool did not ask for the 1-hour cache hint; it is not proof of the effective upstream TTL. Other reported cache fields can still show 1-hour or 5-minute cache activity.

These diagnostics reflect Claude Code CLI output, not direct Anthropic API state.

For automatic git evidence, the Git Evidence Summary includes `git diff --stat HEAD`, `git diff --name-status HEAD`, and `git ls-files --others --exclude-standard`. `getGitStatus` uses `git status --porcelain=v2` and `getGitDiff` uses `git diff --no-ext-diff HEAD`, so staged and unstaged tracked changes are included.

For `review_diff`, `adversarial_review`, or explicit `includeGitDiff: true`, tracked raw git diff evidence is routed before it enters the packet:

- `Changed Files Manifest`: markdown table with `File`, `Status`, `Inclusion`, `+/-`, and `Reason`.
- `Context Routing Guidance`: tells Claude Code to inspect `partial` or `omitted` files with available tools when they matter.
- `Routed Git Diff Evidence`: per-file diff bodies selected by the router.

Tracked diff routing sorts files by review value before consuming the body budget. Reviewer infrastructure, MCP transport, runner, packet/schema/config, release/install workflow, and security/config evidence is routed ahead of routine source, tests, and docs. Every manifest reason starts with a risk category such as `risk: mcp_transport; source diff within budget` or `risk: generated_or_lockfile; omitted`.

For `review_diff` and `adversarial_review`, selected untracked text file bodies are embedded by default when git auto-discovery is enabled. Untracked candidates are also routed before body budget is consumed so high-value source and configuration files beat lower-value docs or generated output. For `review_plan` and `review_doc`, untracked paths remain summary-only unless `includeUntrackedContent: true` is set. Set `includeUntrackedContent: false` to disable untracked body embedding.

When `includeUntrackedContent` is explicitly set, it overrides the task default and `autoDiscoverGit` default. For example, `includeUntrackedContent: true` can embed selected untracked text bodies even when `autoDiscoverGit: false`; use `includeUntrackedContent: false` when untracked paths should remain path-only.

Untracked routing adds separate sections:

- `Untracked Files Manifest`: markdown table with `File`, `Inclusion`, `Bytes`, `Reason`, and `Redacted`.
- `Untracked Content Routing Guidance`: explains full, partial, and omitted untracked files.
- `Routed Untracked File Evidence`: selected untracked text bodies.

`Inclusion` values:

- `full`: the file diff body is included completely.
- `partial`: the file diff body is included with head/tail preservation and middle truncation.
- `omitted`: the file is listed in the manifest but its diff body is not embedded.

The router's diff budget governs embedded diff body content. Structural markdown such as the manifest table, context-routing guidance, and section wrappers is added on top so Claude Code still receives the navigation map needed to inspect partial or omitted files.

Default omitted categories are binary diff blocks, null-byte files, lockfiles, generated package lock output, minified assets, oversized untracked files, symlinks, paths resolving outside the repository root, dependency/vendor/cache output, and common build output paths such as `dist/`, `build/`, `coverage/`, `.next/`, and `node_modules/`. These omissions are packet-routing decisions only; Claude Code still has repository tools available and should inspect omitted files when they may be relevant.

Sensitive-looking filenames such as `.env`, `secret`, or `credential` are not blocked by filename alone. If a selected file is text and passes review-quality filters, it can be embedded. `redactSecrets: true` applies best-effort content redaction before embedding, including common key/token/password and uppercase environment-style assignments, but it is not a security boundary.

The local CLI also provides packet preview without invoking Claude Code:

```bash
codex-cc-reviewer preview --task review_diff --context "Preview packet"
```

Review packet blocks use a large context budget by default. Oversized blocks are truncated from the middle with a marker while preserving both the beginning and the end.

## Maintainer Cache Research

Maintainers can run repeat-call cache experiments without invoking Codex:

```bash
npm run research:cache-repeat -- --runs 2 --stable-location stdin --dynamic-mode suffix
```

For a real packet experiment, generate a packet with preview and pass it by file:

```bash
codex-cc-reviewer preview --task review_diff --context "Cache experiment" > packet.md
npm run research:cache-repeat -- --packet-file packet.md --dynamic-mode same
```

The research harness sends packet content to Claude Code through stdin, never argv, and its JSON summary omits prompt, packet, stdin, and stderr content. Packet reorder remains unimplemented until this cache ground-truth evidence shows it can help.

The harness is directional evidence, not a byte-equivalent replay of `cc_review`: it uses a controlled `claude -p` invocation to compare repeated-call cache behavior while keeping packet content out of argv and summaries. Packet-file experiment cost scales with packet size times run count; start with a small or medium preview packet before running larger reviews. Treat results as a decision aid before packet-order changes, not as a production review contract.
