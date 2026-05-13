# codex-cc-reviewer

[English](README.md) | [简体中文](README.zh-CN.md)

[![npm version](https://img.shields.io/npm/v/codex-cc-reviewer.svg)](https://www.npmjs.com/package/codex-cc-reviewer)
[![CI](https://github.com/Yiyuiii/codex-cc-reviewer/actions/workflows/ci.yml/badge.svg)](https://github.com/Yiyuiii/codex-cc-reviewer/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js >=20](https://img.shields.io/badge/node-%3E%3D20-339933.svg)](https://nodejs.org/)

Use Claude Code as a second-opinion reviewer for Codex via MCP.

**Codex builds. Claude reviews. Codex decides.**

`codex-cc-reviewer` is for developers who use Codex as their main implementation agent but want Claude Code to challenge plans, diffs, risky design choices, and security-sensitive changes before Codex proceeds.

It is intentionally narrow:

- one MCP tool: `cc_review`
- Claude Code runs as a local reviewer subprocess
- Codex remains the orchestrator and final decision-maker
- no broad bidirectional agent bridge

Status: early `0.1.x`. The core workflow is usable, but the project is still pre-1.0 and intentionally conservative in scope.

Proof of work: this project is roughly 99% developed and maintained by Codex itself, with Claude Code / Opus used through `cc_review` as an advisory reviewer.

## Why

- Review implementation plans before coding.
- Review diffs before final answers or commits.
- Ask for adversarial review on risky changes.
- Keep Codex in control instead of creating a broad multi-agent bridge.
- See what Claude Code did: tool activity, structured timeline events, transcript snippets, cache diagnostics, and cost.

## The Opus case

This project is intentionally Opus-oriented. The default `model: "opus"` is not incidental: the bridge is meant for cases where Claude Code review is valuable enough to spend Opus-level budget. Other Claude Code models may run if you override the model, but they are not the core value proposition.

The motivating observation, as of May 2026, is specific and deliberately subjective: in the author's Claude Plan workflows, after the Opus 4.6-era Claude Code path was forced from the older roughly 200K-context working style into a 1M-context working style, Opus became much less reliable as a continuous autonomous coding agent. This failure mode was consistently reproducible in the author's long coding sessions: Opus may forget an earlier conclusion, infer code it has not read, or push toward completion before verifying the repository evidence. In the month that led to this tool, the practical symptom was more uninspected guesses and less reliable carry-over from earlier context.

That does not make Opus useless. It changes where Opus is most valuable. `codex-cc-reviewer` spends Claude Code / Opus quota on bounded review work that does not need to be obeyed wholesale: challenge a plan, inspect a diff, point out missed risks, and provide review highlights. Codex keeps the task state, implements, verifies, and decides which Opus findings to accept, reject, or defer.

## Who this is for

Use this if:

- Codex is your main implementation agent.
- You want Claude Code to act as a second reviewer, not as the primary coding agent.
- You specifically want to spend Claude Code Opus quota on review signal rather than continuous execution.
- You have seen Opus in long AI coding sessions drift, guess without reading, or rush past verification.
- You want reviews before coding, before final answers, or before commits.
- You want Codex to synthesize Claude's feedback instead of blindly accepting it.

## Not for

This is not:

- a general Claude Code and Codex bridge
- a GitHub PR review bot or CI-only reviewer
- a multi-agent debate framework
- a tool for running Claude Code as the primary implementation agent
- a safe default for untrusted repositories or shared machines
- a tool that makes Claude's review automatically authoritative

## Requirements

- Node.js 20 or newer
- npm
- Claude Code CLI installed, on `PATH`, and authenticated locally
- Codex with MCP support
- A trusted local repository, VM, or dev container

Run Claude Code once interactively before using this tool, so local authentication is ready.

## Quickstart

If you are already working inside Codex or another local coding agent, ask it to read this README and run the install for you:

```text
Read this README. Then run exactly these commands:
npm install -g codex-cc-reviewer
codex-cc-reviewer install
codex-cc-reviewer doctor

Afterward, verify the MCP config changed as expected and report any files or settings you changed. Do not invent extra setup steps. Do not use sudo.
```

Manual install:

```bash
npm install -g codex-cc-reviewer
codex-cc-reviewer install
codex-cc-reviewer doctor
```

Restart Codex after installation. The default permission mode is `bypassPermissions`; read [Safety And Configuration](#safety-and-configuration) before using this in shared or sensitive environments.

Then ask Codex:

> Before implementing this feature, call `cc_review` to ask Claude Code to review the plan. After implementation, call `cc_review` again to review the diff.

What should happen:

1. Codex drafts the plan or prepares the diff context.
2. Codex calls the MCP tool `cc_review`.
3. `codex-cc-reviewer` starts Claude Code headlessly in your local environment.
4. Claude Code reviews the packet and exits.
5. Codex receives one MCP result containing Claude's review plus recent activity, timeline, transcript, cache, diagnostics, and cost details when available.

Codex should treat that result as a review opinion, not as ground truth.

For an automated convergence workflow where Codex calls `cc_review` at plan and diff checkpoints, see [docs/codex-usage.md](docs/codex-usage.md) and [examples/codex-global-prompt.md](examples/codex-global-prompt.md).

## Manual Codex Config

If you prefer manual setup, add this to `~/.codex/config.toml` or a trusted project `.codex/config.toml`:

```toml
[mcp_servers.codex_cc_reviewer]
command = "npx"
args = ["-y", "codex-cc-reviewer", "serve"]
startup_timeout_sec = 20
tool_timeout_sec = 900
required = false
enabled = true
enabled_tools = ["cc_review"]
```

Restart Codex after changing MCP configuration. See [docs/manual-setup.md](docs/manual-setup.md) for the standalone setup note.

## Safety And Configuration

The default mode is intentionally powerful. This package is tuned for a trusted local owner workflow:

- `model`: `opus`
- `effort`: `max`
- `permissionMode`: `bypassPermissions`
- `tools`: `["default"]` for MCP input; the local CLI also accepts comma-separated strings
- `stream`: `true`
- `cacheTtl`: `1h`
- `redactSecrets`: `false`

With `permissionMode: "bypassPermissions"`, this server invokes Claude Code with `--dangerously-skip-permissions`. Use that only in repositories, VMs, dev containers, or local workspaces you control.

These are example configurations, not built-in profile names:

| Use case | Suggested fields | Notes |
| --- | --- | --- |
| Trusted local owner workflow | `permissionMode: "bypassPermissions"`, `tools: ["default"]`, `redactSecrets: false` | Full-fidelity local workflow for your own repo, VM, or dev container. |
| Conservative review | `permissionMode: "plan"` or `"default"`, `tools: ["Read", "Grep", "Glob"]`, `redactSecrets: true` | Use for sensitive or shared repositories where review should stay mostly read-only. |
| Budget-limited review | `maxBudgetUsd`, lower `maxTurns`, optionally `cacheTtl: "5m"` | The server forwards budget and turn limits to Claude Code. Use for large diffs or repeated reviews. |

Review packets are sent as faithfully as possible by default. `redactSecrets: true` enables best-effort redaction, but it is not comprehensive and can remove useful evidence.

See [docs/security.md](docs/security.md) for the full security note.

## Usage Examples

### Review before implementation

Ask Codex:

> Draft the implementation plan first. Before coding, call `cc_review` with `task: "review_plan"` and ask Claude Code to look for missing steps, risky assumptions, and simpler alternatives.

### Review the current diff

Ask Codex:

> Review the current diff with Claude Code before finalizing. Focus on correctness, regressions, and missing tests.

### Adversarial review

Ask Codex:

> Ask Claude Code for an adversarial review. Challenge the chosen design, especially around auth, data loss, rollback, race conditions, and reliability.

### Security-sensitive change

Ask Codex:

> Before changing auth or permissions logic, ask Claude Code to review the plan and then the final diff. Use a conservative permission mode.

### Review docs or architecture

Ask Codex:

> Ask Claude Code to review this design doc for ambiguity, unsupported assumptions, and migration risks before implementation starts.

For synthesis guidance after a review, see [docs/codex-usage.md](docs/codex-usage.md).

## Direct Tool Input

The MCP server exposes one tool: `cc_review`.

```json
{
  "task": "review_diff",
  "originalGoal": "Add a safer release flow.",
  "reviewFocus": "Look for correctness, regressions, and missed tests.",
  "codexSummary": "Updated release docs and package metadata.",
  "testsRun": ["npm test: passed"],
  "context": "Review the current change."
}
```

For `review_diff` and `adversarial_review`, git status and `git diff HEAD` evidence are collected automatically unless `autoDiscoverGit` is set to `false`. `prompt` remains accepted as a backward-compatible alias for `reviewFocus`.

Local CLI test with an optional review focus:

```bash
codex-cc-reviewer review --task review_plan --review-focus "Review the plan" --context "..."
```

See [docs/tool-contract.md](docs/tool-contract.md) for all input and output fields.

## What Codex Receives Back

The final MCP result includes Claude's review text, recent Claude Code activity events, a structured activity timeline, recent transcript snippets, prompt cache token counts and effective cache status when reported, diagnostics, and cost when reported.

Shortened example:

```json
{
  "ok": true,
  "task": "review_diff",
  "model": "opus",
  "elapsedMs": 42100,
  "review": "The main risk is ...",
  "command": ["claude", "-p", "Review the packet provided on stdin.", "..."],
  "eventsTail": ["tool_use: Read {\"file_path\":\"README.md\"}", "result"],
  "activityTail": [
    {
      "index": 12,
      "kind": "tool_use",
      "rawType": "assistant",
      "summary": "Read README.md",
      "toolName": "Read"
    }
  ],
  "transcriptTail": ["Claude inspected the diff and focused on correctness."],
  "eventCount": 128,
  "cache": {
    "creationInputTokens": 1234,
    "readInputTokens": 5678,
    "effective": "hit"
  },
  "diagnostics": ["MCP progress unavailable: request did not include _meta.progressToken."],
  "costUsd": 0.42,
  "exitCode": 0
}
```

While Claude Code runs, the MCP server also sends `notifications/progress` when the Codex MCP client provides a `progressToken`. If the client does not provide one, the final detail still includes the captured timeline and a diagnostic explains why real-time progress was unavailable.

## Troubleshooting

Run:

```bash
codex-cc-reviewer doctor
```

Common issues:

- `claude` is not found: install Claude Code and make sure it is on `PATH`.
- Claude is not authenticated: run Claude Code interactively once and complete auth.
- Codex config is missing: run `codex-cc-reviewer install`.
- Codex does not show the tool: restart Codex after changing MCP config.
- Reviews time out: increase `tool_timeout_sec` in Codex config.
- Codex only shows one tool call while Claude Code is running: real-time progress requires the Codex MCP client to send `_meta.progressToken`. If it does not, check the final `diagnostics` and `activityTail` fields instead.
- Cache reads stay at zero: the first run may be a cold cache write, Claude Code may not have reported usage, or the prompt may be below the model's minimum cacheable length.

See [docs/troubleshooting.md](docs/troubleshooting.md) for the full troubleshooting guide.

## How Is This Different?

`codex-cc-reviewer` is intentionally narrow. It is about bringing Claude Code review into a local Codex workflow, not replacing either tool.

| Project style | Typical direction | This project |
| --- | --- | --- |
| Claude Code plugin for Codex | Claude Code calls Codex | Codex calls Claude Code |
| PR review bots | GitHub PR events trigger review | Local Codex workflow triggers review |
| Multi-agent loops | Agents debate or iterate automatically | Claude reviews once; Codex synthesizes |
| Broad bridges | Many tools and bidirectional delegation | One MCP tool: `cc_review` |

See [docs/prior-art.md](docs/prior-art.md) for related work and scope boundaries.

## Documentation

- [Installation](docs/installation.md): install commands and requirements.
- [Manual setup](docs/manual-setup.md): Codex MCP config snippet.
- [Codex usage](docs/codex-usage.md): when to call `cc_review` and how to synthesize feedback.
- [Tool contract](docs/tool-contract.md): complete MCP input and output fields.
- [Security](docs/security.md): default permission posture and safer settings.
- [Troubleshooting](docs/troubleshooting.md): common setup problems.
- [Prior art](docs/prior-art.md): related workflows and project scope.
- [Examples](examples): sample Codex config, AGENTS guidance, synthesis packet, and global prompt.
- [Changelog](CHANGELOG.md): release notes.
- [Security policy](SECURITY.md): vulnerability reporting scope.

## Contributing

Contributions are welcome when they keep the project narrow: better prompts, safer defaults, install support, Claude CLI parsing, tests, and docs.

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
