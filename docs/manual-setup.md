# Manual Setup

Add this to `~/.codex/config.toml` or a trusted project `.codex/config.toml`:

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

Restart Codex after changing MCP configuration.

