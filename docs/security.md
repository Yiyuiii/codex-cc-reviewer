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
- `review_diff` and `adversarial_review` auto-discover git status, git diff, and selected untracked text file bodies by default
- `review_plan` and `review_doc` include only a lightweight git summary by default; set `autoDiscoverGit`, `includeGitDiff`, `includeGitStatus`, or `includeUntrackedContent` explicitly to override task defaults
- non-empty git diff output that cannot be parsed into `diff --git` blocks is embedded as `[unparsed-diff]` raw fallback evidence; `redactSecrets=true` is applied before embedding
- review packet content is sent as provided by default
- `redactSecrets=true` enables best-effort redaction, but it may remove useful evidence and is not comprehensive

This is intentionally optimized for a trusted owner workflow. `bypassPermissions` skips Claude Code permission checks and should not be used in untrusted repositories. Run in a sandbox, VM, dev container, or trusted local checkout.

For diff-oriented reviews, selected untracked text files can include local files such as `.env`, `.env.local`, `*.pem`, `id_rsa*`, `kubeconfig`, `.aws/credentials`, and debug dumps when they are untracked and not ignored. Security and configuration paths, including `.env`, are treated as high-value review evidence and can be routed before routine source files. Use `includeUntrackedContent=false` to keep untracked files path-only, or `redactSecrets=true` for best-effort content redaction. Redaction is pattern-based and may miss uncommon formats, unquoted multi-word values, or secret types outside its rules.

Claude Code is still an external process with access according to your local Claude settings and the tool allowlist you pass. Review what you send and keep sensitive repositories on explicit conservative settings when needed.
