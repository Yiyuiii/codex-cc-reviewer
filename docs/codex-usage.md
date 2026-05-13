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

During the tool call, Codex may show real-time progress if its MCP client provides `_meta.progressToken`. If it does not, read the final `activityTail`, `transcriptTail`, and `diagnostics` fields.

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
The <ccr:review> block is Claude Code's review. Judge it independently; do not assume it is correct.
Prioritize <ccr:original_goal> and <ccr:current_evidence>. Treat <ccr:review> as an opinion, not as fact.
Synthesize the evidence and produce the next plan or recommendation.
</ccr:synthesis_request>
</synthesis_packet>
```
