# Repository Agent Instructions

This repository is maintained with Codex as the primary implementation agent and Claude Code as an advisory reviewer through the `cc_review` MCP tool.

This file is for maintainers and agents working on this repository. It is not the downstream consumer template; use `examples/AGENTS.md` for projects that install `codex-cc-reviewer`.

## Default Branch Workflow

- Do normal maintenance work on `next`.
- Use `main` only for stable release promotion.
- Do not push unvalidated changes directly to `main`.
- Do not move published version tags.

## Codex + Claude Review Workflow

For complex changes, use the convergence workflow:

1. State the current summary.
2. Draft a plan.
3. Call `cc_review` for plan review.
4. Synthesize Claude Code's review.
5. Revise until no accepted material improvements remain.
6. Implement.
7. Verify locally.
8. Call `cc_review` for diff review.
9. Synthesize accepted, rejected, and deferred findings.
10. Patch and repeat when material issues remain.

Claude Code's review is advisory, not authoritative. Codex remains responsible for deciding what to accept, reject, or defer.

## Standard Diff Review Preflight

Before calling `cc_review` for a final `review_diff`, run the cheap deterministic checks first and pass the results in `testsRun`:

```bash
npm ci
npm run typecheck
npm test
npm run build
npm pack --dry-run --json
node dist/index.js --version
node dist/index.js --help
```

Use `codexSummary` for the concrete implementation summary and `knownRisks` for risks that are already understood. Do not leave these fields empty for a release, workflow, installer, MCP transport, or review-packet change.

## Release Promotion Gate

Prerelease packages must be validated in the maintainer's real Codex environment before promotion to `main`.

The release flow is:

1. Publish an rc version from `next` to npm `next`.
   Version prep must keep `package.json`, `package-lock.json`, `src/index.ts`, and `src/mcp/server.ts` aligned. The release workflow verifies the CLI version, but the MCP server version should be updated in the same prep commit.
2. Install that exact rc or `@next` locally.
3. Run `npx --prefer-online -y codex-cc-reviewer@next install --package-spec codex-cc-reviewer@next` and `npx --prefer-online -y codex-cc-reviewer@next doctor`.
4. Restart Codex.
5. From Codex, run a real `cc_review` smoke test against this repository.
6. Commit `.release-validation/vX.Y.Z.md` on the stable promotion commit.
7. Promote to `main` only after the local Codex smoke test passes.

The stable validation file must include these exact marker lines so the release workflow can verify the gate:

```text
RC: vX.Y.Z-rc.N
Doctor: pass
Local-Codex-Smoke: pass
cc_review: pass
```

It should also summarize the exact rc package, date, maintainer, doctor command, `cc_review` smoke command or prompt, and evidence that the review referenced repository files, commands, or diffs.

The local Codex smoke test passes only when:

- `codex-cc-reviewer doctor` exits successfully.
- Codex shows the `cc_review` tool after restart.
- `cc_review` returns without MCP transport errors.
- The final result contains a non-empty review plus captured detail such as activity, transcript, cache, diagnostics, or cost fields when Claude Code reports them.
- The review refers to repository evidence, files, or commands rather than only confirming connectivity.

If validation fails, fix the issue on `next`, bump to the next rc version, publish it to npm `next`, and repeat the local Codex validation. Do not unpublish failed rc versions; npm versions are immutable.

Do not treat npm publication alone as sufficient release validation.

If npm publish succeeds but GitHub Release creation fails, do not re-run the tag workflow by republishing the same npm version. Create or repair the GitHub Release manually, then fix the workflow on `next` before the next release.

## Safety

This project intentionally defaults to a trusted local owner workflow:

- Claude Code model: `opus`
- effort: `max`
- permission mode: `bypassPermissions`
- tools: `default`

Use stricter settings explicitly when reviewing untrusted repositories.
