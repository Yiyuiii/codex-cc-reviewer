# codex-cc-reviewer Design

## Goal

Build a narrow Codex-side MCP server that exposes one tool, `cc_review`, and runs Claude Code headlessly as an external reviewer for plans, diffs, documents, and adversarial review requests.

## Scope

The first usable version focuses on local developer use:

- Start an MCP stdio server with a single `cc_review` tool.
- Build a stable review packet instead of forwarding raw user input.
- Run `claude -p` through a small runner with safe defaults.
- Provide a local `review` command for testing without Codex.
- Provide a `doctor` command for environment checks.
- Provide install/uninstall helpers for Codex MCP config.
- Ship enough docs and examples for public GitHub use.

Out of scope for v0.1:

- A bidirectional Codex/Claude bridge.
- Autonomous file editing by Claude.
- A hosted service or dashboard.
- Multiple MCP tools for every review type.
- Skipping Claude permission checks by default.

## Architecture

The package is a TypeScript ESM CLI. The CLI entrypoint dispatches to `serve`, `review`, `doctor`, `install`, and `uninstall`.

The MCP server uses `@modelcontextprotocol/sdk` over stdio. It registers `cc_review`, validates input with `zod`, calls the Claude runner, and returns both text content and structured content.

The runner builds a Markdown review packet, injects lightweight git summary evidence when git discovery is enabled, optionally injects raw local git status and diff, redacts common secret patterns only when requested, applies a large packet budget with middle truncation, and invokes Claude Code in print mode. The prompt is sent through stdin to avoid command-line length limits, especially on Windows. JSON output is parsed from Claude's `result` and `structured_output` fields when available.

## Safety

Defaults are intentionally powerful for a trusted local owner workflow:

- `permissionMode`: `bypassPermissions`
- `tools`: `default`
- `model`: `opus`
- `effort`: `max`
- no public cost or turn caps
- `includeGitDiff`: `false`
- `includeGitStatus`: `false`
- secret redaction disabled by default for faithful packet transmission
- timeout remains as service hang protection

The MCP tool is marked read-only and non-destructive. Claude remains a reviewer subprocess. Codex remains responsible for deciding whether to accept the findings.

## Tool Contract

`cc_review` accepts:

- `task`: `review_plan`, `review_diff`, `review_doc`, or `adversarial_review`
- `context`: required review context
- optional `prompt`
- optional Claude settings: `model`, `effort`, `output`, `permissionMode`, `tools`, `cwd`
- optional git controls: `includeGitDiff`, `includeGitStatus`, `autoDiscoverGit`

It returns:

- `ok`
- `task`
- `model`
- `elapsedMs`
- `review`
- optional `structured`
- sanitized `command`
- optional `stderrTail`
- optional `exitCode`

## Error Handling

Validation errors should fail before spawning Claude. Runner failures should still return structured details: exit code, stderr tail, elapsed time, and raw stdout when useful. Timeout should be configurable internally and default to 15 minutes to match the expected Codex `tool_timeout_sec`.

## Testing

Core behavior is testable without Claude installed by dependency-injecting the process executor:

- input schema accepts defaults and rejects unsafe modes
- review packet contains task, context, prompt, git blocks, and redaction
- Claude args include safe defaults and parse JSON output
- failed Claude process returns `ok: false` with stderr tail
- install/uninstall config helpers update Codex TOML text idempotently

CLI smoke tests should avoid requiring Codex or Claude auth; `doctor` can report missing or inaccessible tools without failing the whole command unless explicitly asked later.

## Packaging

Use npm as the package manager because it is present in the current environment. The published package name is `codex-cc-reviewer`; the name is currently available on npm. GitHub release automation can be added with npm trusted publishing once the repository exists publicly.
