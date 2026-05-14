# Release Assurance Design

## Goal

Make the next maintenance release machine-verifiable without changing `cc_review` packet behavior.

The next version should be `0.2.3`. It should harden CI, release publishing, and local release evidence while deferring untracked-file packet embedding and risk-priority diff routing to a later `0.3.0` design.

## Scope

Accepted for `0.2.3`:

- Standardize release preflight commands so local and CI verification cover typecheck, tests, build, npm package contents, and CLI smoke checks.
- Add CI concurrency cancellation, job timeout, pack/CLI smoke checks, and short-lived artifacts.
- Add release workflow checks for package version/tag consistency, npm/Node diagnostics, pack/CLI smoke, stable-release validation evidence, publish verification, and GitHub Release creation.
- Validate the npm pack dry-run manifest so required published files are present and repository-only files are not accidentally included.
- Remove `workflow_dispatch` from the release workflow because the current manual trigger cannot publish and always fails the tag guard.
- Require stable release tags to point at a commit containing `.release-validation/vX.Y.Z.md` with machine-readable local Codex smoke markers.

Deferred to `0.3.0`:

- Embedding untracked file contents in review packets.
- Risk-priority routing for diff evidence.
- Release job environment protection until the npm Trusted Publisher environment setting is confirmed to match the workflow environment.

## Architecture

The package keeps one npm release workflow, but the workflow becomes stricter before and after `npm publish`. The publish job keeps minimal `contents: read` plus `id-token: write` permissions. A separate GitHub Release job receives `contents: write` so repository write permission is isolated from npm publishing.

Local release evidence is stored as a committed markdown file under `.release-validation/`. Stable tags require that file at the tagged commit and require exact marker lines:

```text
RC: vX.Y.Z-rc.N
Doctor: pass
Local-Codex-Smoke: pass
cc_review: pass
```

This preserves the real local Codex validation gate while making it auditable by the release workflow.

Validation files are normalized for LF line endings through `.gitattributes`, and the release workflow strips trailing carriage returns before marker checks so Windows-authored evidence files do not break stable release promotion.

## Testing

Config behavior is covered by repository tests that read `package.json`, `.github/workflows/ci.yml`, and `.github/workflows/release.yml`. Full verification runs:

```bash
npm run typecheck
npm test
npm run build
npm pack --dry-run --json
node dist/index.js --version
node dist/index.js --help
```

The release workflow also verifies the published npm version and dist-tag with retry to tolerate registry propagation delay.
