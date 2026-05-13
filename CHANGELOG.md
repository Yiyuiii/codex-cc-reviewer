# Changelog

## 0.1.1

- Preserve review packet text by default; redaction is opt-in.
- Add transcript snippets from Claude Code stream output.
- Change generated Codex config to `required = false`.
- Improve English and Chinese README pages with language links.
- Explicitly ask Claude to include the complete review in the final response.

## 0.1.0

- Initial MCP stdio server with `cc_review`.
- Claude Code headless runner.
- Local `review` CLI command.
- `install`, `uninstall`, and `doctor` commands.
- Default deep autonomous review: `opus`, `max`, `bypassPermissions`, `default` tools.
- Stream-json activity capture in final review output.
- 1-hour prompt cache TTL hint.
- Raw packet transmission by default; redaction is opt-in.
- Codex install config uses `required = false`.
