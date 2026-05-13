# Security

`codex-cc-reviewer` is intentionally narrow.

Default posture:

- one MCP tool: `cc_review`
- Claude model: `opus`
- Claude effort: `max`
- Claude permission mode: `bypassPermissions`
- Claude tools: `default`
- stream-json activity capture enabled
- 1-hour prompt cache TTL hint enabled
- no git status or diff unless requested
- common secrets are redacted before the packet is sent

This is intentionally optimized for a trusted owner workflow. `bypassPermissions` skips Claude Code permission checks and should not be used in untrusted repositories. Run in a sandbox, VM, dev container, or trusted local checkout.

Claude Code is still an external process with access according to your local Claude settings and the tool allowlist you pass. Review the generated packet and keep sensitive repositories on explicit conservative settings when needed.
