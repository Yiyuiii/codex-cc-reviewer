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
5. Run deterministic local verification before diff review.
6. Call `cc_review` with `task="review_diff"` and include the git diff.
7. Apply accepted fixes.
8. In the final answer, summarize what Claude flagged, what you accepted, and what you rejected.

For this repository, the standard preflight is:

```bash
npm ci
npm run typecheck
npm test
npm run build
npm pack --dry-run --json
node dist/index.js --version
node dist/index.js --help
```

Pass those results through `testsRun`. Fill `codexSummary` with what changed and `knownRisks` with the risks Codex already sees.

Do not blindly follow Claude. Codex remains responsible for the final answer.

Default `cc_review` profile:

- `model="opus"`
- `effort="max"`
- `permissionMode="bypassPermissions"`
- `tools="default"`
- streaming activity capture enabled
- 1-hour cache TTL hint enabled

Use this only in trusted local workspaces. Pass stricter values explicitly when reviewing untrusted code.
