# Troubleshooting

Run:

```bash
codex-cc-reviewer doctor
```

Common issues:

- `claude` is not found: install Claude Code and make sure it is on `PATH`.
- Claude is not authenticated: run Claude Code interactively once and complete auth.
- Claude Code version is below the validated floor: upgrade Claude Code to at least `2.1.92` before relying on review diagnostics.
- Codex config is missing: run `codex-cc-reviewer install`.
- Codex does not show the tool: restart Codex after changing MCP config.
- Reviews time out: increase `tool_timeout_sec` in Codex config.
- `doctor` warns about Claude Code daemon version mismatch: stale background sessions may have survived a Claude Code upgrade. Run `claude agents`, then `claude stop <id>` for stale sessions before debugging review failures.
- `doctor` warns about blocked background jobs: `cc_review` still uses `claude -p`; the warning means local Claude Code background state may be stale or confusing while you troubleshoot.
- Review packet contents are surprising: run `codex-cc-reviewer preview --task review_diff --context "Preview packet"` from the repository to print the packet without starting Claude Code.
- Untracked file bodies are included unexpectedly: `review_diff` and `adversarial_review` include selected untracked text by default when git auto-discovery is enabled. Set `includeUntrackedContent: false` or use `--no-include-untracked-content` in the local CLI.
- Redaction did not remove a value: `redactSecrets` is best-effort pattern redaction, not a security boundary. It handles common key/token/password and uppercase environment-style assignments, but users should still avoid sending sensitive repositories to the default trusted-local profile.
- Codex only shows one tool call while Claude Code is running: real-time progress requires the Codex MCP client to send `_meta.progressToken`. If it does not, check the final `diagnostics` and `activityTail` fields instead.
- Cache reads stay at zero: the first run may be a cold cache write, Claude Code may not have reported usage, or the prompt may be below the model's minimum cacheable length.

