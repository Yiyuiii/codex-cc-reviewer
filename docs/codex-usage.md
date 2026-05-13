# Codex Usage

Use `cc_review` when you want a second opinion from Claude Code.

Recommended mental model:

- Codex owns the task state, implementation, verification, and final decision.
- Claude Code provides focused, high-effort Opus review at useful checkpoints.
- Claude's output is evidence to synthesize, not an instruction to obey blindly.

This workflow is Opus-oriented. The default `model: "opus"` assumes that the useful signal comes from spending Claude Code / Opus quota on deep review, while Codex preserves execution state and makes the final decision.

Good review points:

- before implementing a non-trivial plan
- after finishing a meaningful diff
- when touching security, permissions, auth, payments, migrations, data deletion, or concurrency
- when the user explicitly asks for Claude review

Example tool input:

```json
{
  "task": "review_plan",
  "originalGoal": "Implement the requested feature without regressing existing behavior.",
  "reviewFocus": "Look for missed steps and risky assumptions.",
  "context": "Review this implementation plan for missed steps and risky assumptions.",
  "output": "markdown"
}
```

Deep review is the default. A minimal call uses `opus`, `max`, `bypassPermissions`, `default` tools, `stream-json`, and a 1-hour cache TTL hint. Override these fields explicitly for a narrower run.

When git discovery is enabled, the server adds a lightweight Git Evidence Summary with diff stat, name-status, and untracked file manifest. For `review_diff` and `adversarial_review`, it also auto-discovers raw git evidence by default: porcelain v2 status plus `git diff --no-ext-diff HEAD`, which includes staged and unstaged tracked changes. Set `autoDiscoverGit: false` only when Codex is already passing explicit evidence or when you intentionally want a context-only review.

`cc_review` does not expose cost or turn caps. Timeout remains as service hang protection, not as a model capability limit.

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

## Codex Global Prompt

If you want Codex to call `cc_review` automatically during complex work, add a global instruction like this after `codex-cc-reviewer` is installed and you understand the safety posture in [security.md](security.md):

```text
For complex changes, always use the Codex + cc_review (Claude's review) convergence workflow:
state summary -> plan -> cc_review -> synthesize -> revise until no accepted material improvements remain -> implement -> verify -> cc_review diff -> synthesize patch plan -> repeat until converged.

Claude's review is advisory, not authoritative. Codex must decide and explain Claude's accepted/rejected/deferred findings.
```

This workflow is useful when the change is complex enough to benefit from an independent challenge. For small edits, it may be unnecessary overhead.
