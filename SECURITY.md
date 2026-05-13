# Security Policy

`codex-cc-reviewer` launches Claude Code as a subprocess.

Default safety posture:

- Claude runs in `bypassPermissions` mode by default because this project is intended for a trusted local owner workflow.
- Claude Code can run tools without permission prompts.
- The MCP server exposes only `cc_review`.
- Secrets are redacted from review packets where possible.
- Git status and diff are not included unless requested.

This default is dangerous in untrusted workspaces. Use a sandbox, VM, dev container, or trusted local repository. Set `permissionMode` and `tools` explicitly if you want a narrower run.

Please do not report prompt injection issues that require intentionally running this tool in an untrusted repository as default vulnerabilities.
