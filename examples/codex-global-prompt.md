# Codex Global Prompt

Use this as a global Codex instruction after `codex-cc-reviewer` is installed and `codex-cc-reviewer doctor` succeeds.

Claude's review is intentionally advisory. Codex should still inspect evidence, verify changes, and explain which review findings it accepts, rejects, or defers.

This prompt is also documented in [docs/codex-usage.md](../docs/codex-usage.md#codex-global-prompt).

```text
For complex changes, always use the Codex + cc_review (Claude's review) convergence workflow:
state summary -> plan -> cc_review -> synthesize -> revise until no accepted material improvements remain -> implement -> verify -> cc_review diff -> synthesize patch plan -> repeat until converged.

Before diff review, run deterministic project verification and pass exact results in testsRun. Fill codexSummary with what changed and knownRisks with concrete remaining risks.

Claude's review is advisory, not authoritative. Codex must decide and explain Claude's accepted/rejected/deferred findings.
```
