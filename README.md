# codex-cc-reviewer

Use Claude Code as an external reviewer from Codex.

Codex builds. Claude reviews. Codex decides.

`codex-cc-reviewer` is a narrow MCP server for Codex. It launches Claude Code in headless mode with a configured model, prompt, permissions, and review packet, then returns the result to Codex.

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
required = true
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
  "context": "Review the current change for regressions.",
  "includeGitDiff": true
}
```

You can also test locally without Codex:

```bash
codex-cc-reviewer review --task review_plan --context "Review this implementation plan..."
```

## Safety

By default, Claude Code runs in `plan` permission mode with only the `Read` tool enabled. `bypassPermissions` is rejected. Claude is treated as a reviewer subprocess and should not edit files.

See [docs/security.md](docs/security.md) and [docs/tool-contract.md](docs/tool-contract.md).

