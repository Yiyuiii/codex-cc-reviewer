# codex-cc-reviewer

[English](README.md) | [简体中文](README.zh-CN.md)

Use Claude Code as an external reviewer from Codex.

**Codex builds. Claude reviews. Codex decides.**

`codex-cc-reviewer` is a focused MCP server for developers who use Codex as the main implementation agent and want Claude Code as a high-effort second reviewer. It launches Claude Code headlessly, sends a structured review packet, captures Claude Code activity from `stream-json`, and returns the review back to Codex.

## Why

- Review implementation plans before coding.
- Review diffs before final answers or commits.
- Ask for adversarial review on risky changes.
- Keep Codex in control instead of creating a broad multi-agent bridge.
- See what Claude Code did: tool activity, transcript snippets, cache stats, and cost.

## Install

```bash
npm install -g codex-cc-reviewer
codex-cc-reviewer install
codex-cc-reviewer doctor
```

## Manual Codex Config

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

## Usage

Ask Codex:

> Implement this feature, but before coding ask Claude Code to review your plan. After coding, ask Claude Code to review the diff.

The MCP server exposes one tool: `cc_review`.

```json
{
  "task": "review_diff",
  "prompt": "Look for correctness, regressions, and missed tests.",
  "context": "Review the current change.",
  "includeGitDiff": true
}
```

Local CLI test:

```bash
codex-cc-reviewer review --task review_plan --prompt "Review the plan" --context "..."
```

## Defaults

This package is tuned for a trusted local owner workflow:

- `model`: `opus`
- `effort`: `max`
- `permissionMode`: `bypassPermissions`
- `tools`: `default`
- `stream`: `true`
- `cacheTtl`: `1h`
- `redactSecrets`: `false`

Review packets are sent as faithfully as possible by default. Redaction is opt-in because altering the text can remove useful evidence.

## What Codex Gets Back

The final MCP result includes:

- Claude's review text
- recent Claude Code tool/activity events
- recent transcript snippets from stream output
- prompt cache creation/read token counts, when reported
- cost, when reported

MCP still returns once after Claude Code exits. Real-time MCP progress notifications are a future feature.

## Safety

The default mode is intentionally powerful. Use it only in trusted repositories, VMs, dev containers, or local workspaces you control. Override `permissionMode`, `tools`, and `redactSecrets` explicitly for stricter runs.

See [docs/security.md](docs/security.md) and [docs/tool-contract.md](docs/tool-contract.md).
