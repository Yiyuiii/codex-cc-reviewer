# Prior Art

This project is inspired by existing Claude/Codex review workflows, but has a narrower scope.

Existing projects often focus on:

- using Codex from Claude Code;
- letting Claude implement and Codex review;
- bidirectional bridges;
- multi-agent review loops;
- PR-only review commands.

`codex-cc-reviewer` focuses only on:

- Codex-side MCP integration;
- Claude Code as a reviewer subprocess;
- one tool: `cc_review`;
- safe defaults;
- quick local install.

Related work:

- OpenAI `codex-plugin-cc` calls Codex from Claude Code, which is the opposite direction.
- Claude Code includes review-oriented CLI workflows such as `ultrareview`.
- Community review loops explore multi-agent review, but this project keeps Codex as the primary implementer.

