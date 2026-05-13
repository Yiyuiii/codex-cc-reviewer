# Security Policy

`codex-cc-reviewer` launches Claude Code as a subprocess.

Default safety posture:

- Claude runs in `plan` permission mode.
- Claude should not edit files.
- The MCP server exposes only `cc_review`.
- `bypassPermissions` is rejected.
- Secrets are redacted from review packets where possible.
- Git status and diff are not included unless requested.

Please do not report prompt injection issues that require intentionally enabling unsafe Claude Code permissions outside a sandbox as default vulnerabilities.

