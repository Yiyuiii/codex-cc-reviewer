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
- Codex only shows one tool call while Claude Code is running: real-time progress requires the Codex MCP client to send `_meta.progressToken`. If it does not, check the final `diagnostics` and `activityTail` fields instead.
- Cache reads stay at zero: the first run may be a cold cache write, Claude Code may not have reported usage, or the prompt may be below the model's minimum cacheable length.

