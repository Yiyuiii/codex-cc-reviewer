# Codex Review Synthesis Packet

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

Keep fields present. Use `(none yet)` when a section has no content.
