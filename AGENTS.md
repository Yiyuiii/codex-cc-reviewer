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

## Release Promotion Gate

Prerelease packages must be validated in the maintainer's real Codex environment before promotion to `main`.

The release flow is:

1. Publish an rc version from `next` to npm `next`.
2. Install that exact rc or `@next` locally.
3. Run `codex-cc-reviewer install` and `codex-cc-reviewer doctor`.
4. Restart Codex.
5. From Codex, run a real `cc_review` smoke test against this repository.
6. Promote to `main` only after the local Codex smoke test passes.

The local Codex smoke test passes only when:

- `codex-cc-reviewer doctor` exits successfully.
- Codex shows the `cc_review` tool after restart.
- `cc_review` returns without MCP transport errors.
- The final result contains a non-empty review plus captured detail such as activity, transcript, cache, diagnostics, or cost fields when Claude Code reports them.
- The review refers to repository evidence, files, or commands rather than only confirming connectivity.

If validation fails, fix the issue on `next`, bump to the next rc version, publish it to npm `next`, and repeat the local Codex validation. Do not unpublish failed rc versions; npm versions are immutable.

Do not treat npm publication alone as sufficient release validation.

## Safety

This project intentionally defaults to a trusted local owner workflow:

- Claude Code model: `opus`
- effort: `max`
- permission mode: `bypassPermissions`
- tools: `default`

Use stricter settings explicitly when reviewing untrusted repositories.
