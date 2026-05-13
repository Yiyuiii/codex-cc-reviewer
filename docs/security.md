# Security

`codex-cc-reviewer` is intentionally narrow.

Default posture:

- one MCP tool: `cc_review`
- Claude model: `opus`
- Claude effort: `max`
- Claude permission mode: `bypassPermissions`
- Claude tools: `default`
- stream-json activity capture enabled
- MCP progress notifications enabled when the client provides `progressToken`
- 1-hour prompt cache TTL hint enabled
- no git status or diff unless requested
- review packet content is sent as provided by default
- `redactSecrets=true` enables best-effort redaction, but it may remove useful evidence and is not comprehensive

This is intentionally optimized for a trusted owner workflow. `bypassPermissions` skips Claude Code permission checks and should not be used in untrusted repositories. Run in a sandbox, VM, dev container, or trusted local checkout.

Claude Code is still an external process with access according to your local Claude settings and the tool allowlist you pass. Review what you send and keep sensitive repositories on explicit conservative settings when needed.
