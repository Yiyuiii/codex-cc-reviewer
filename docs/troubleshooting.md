# Troubleshooting

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

