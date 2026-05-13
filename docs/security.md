# Security

`codex-cc-reviewer` is intentionally narrow.

Safety defaults:

- one MCP tool: `cc_review`
- Claude permission mode: `plan`
- Claude tools: `Read`
- no git status or diff unless requested
- common secrets are redacted before the packet is sent
- `bypassPermissions` is not accepted by the input schema

Claude Code is still an external process with access according to your local Claude settings and the tool allowlist you pass. Review the generated packet and keep sensitive repositories on conservative settings.

