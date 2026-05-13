# Codex + Claude Code Reviewer

Use the `cc_review` MCP tool when:

- you create a non-trivial implementation plan;
- you finish a meaningful diff;
- the change touches auth, payment, data deletion, migrations, concurrency, security, or permissions;
- you are unsure about correctness;
- the user explicitly asks for Claude review.

Default workflow:

1. Draft the plan.
2. Call `cc_review` with `task="review_plan"`.
3. Update the plan based on accepted findings.
4. Implement.
5. Call `cc_review` with `task="review_diff"` and include the git diff.
6. Apply accepted fixes.
7. In the final answer, summarize what Claude flagged, what you accepted, and what you rejected.

Do not blindly follow Claude. Codex remains responsible for the final answer.

