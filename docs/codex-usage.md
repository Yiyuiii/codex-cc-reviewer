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

Deep review is the default. A minimal call uses `opus`, `max`, `bypassPermissions`, `default` tools, `stream-json`, and a 1-hour cache TTL hint. Override these fields explicitly for a narrower run.

After receiving a Claude review, Codex should synthesize rather than blindly accept it. Recommended lightweight packet:

```xml
<synthesis_packet>
<ccr:original_goal>
{{original_goal}}
</ccr:original_goal>

<ccr:review>
{{claude_review}}
</ccr:review>

<ccr:codex_progress>
{{codex_progress | (none yet)}}
</ccr:codex_progress>

<ccr:current_evidence>
{{current_evidence}}
</ccr:current_evidence>

<ccr:synthesis_request>
以上 <ccr:review> 是 Claude Code 的审查报告，请独立判断、不必默认采信。
优先依据 <ccr:original_goal> 与 <ccr:current_evidence>，把 <ccr:review> 作为观点而非事实，
辩证融合后给出新一轮方案与建议。
</ccr:synthesis_request>
</synthesis_packet>
```
