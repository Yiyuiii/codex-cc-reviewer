# Codex Usage

Use `cc_review` when you want a second opinion from Claude Code.

Good review points:

- before implementing a non-trivial plan
- after finishing a meaningful diff
- when touching security, permissions, auth, payments, migrations, data deletion, or concurrency
- when the user explicitly asks for Claude review

Example tool input:

```json
{
  "task": "review_plan",
  "context": "Review this implementation plan for missed steps and risky assumptions.",
  "output": "markdown"
}
```

