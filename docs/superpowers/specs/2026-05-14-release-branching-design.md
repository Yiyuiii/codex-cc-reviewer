# Release Branching Design

## Goal

Make releases safer without losing npm Trusted Publishing automation.

Maintainers should work on a test branch by default, validate prereleases from that branch, and publish stable versions only from the release branch.

## Branch Model

- `next`: maintainer working branch and prerelease branch.
- `main`: stable release branch.

Normal development happens on `next`. `main` should only receive changes after they have passed CI and prerelease validation on `next`.

## Version Model

npm versions are immutable, so prerelease validation must not consume a stable version number.

- `next` prerelease tags use semver prerelease versions, for example `v0.2.1-rc.0`.
- `main` release tags use stable semver versions, for example `v0.2.1`.

Prereleases publish to the npm `next` dist-tag. Stable releases publish to the npm `latest` dist-tag.

## Workflow Behavior

`CI` should run on:

- pushes to `next`
- pushes to `main`
- pull requests targeting `main`

`Release` should run on pushed tags matching `v*`.

The release workflow should derive publishing behavior from the tag:

- If the tag contains a prerelease suffix such as `-rc.`, publish with `npm publish --tag next`.
- Otherwise, publish with `npm publish --tag latest`.

The workflow should validate branch ancestry before publishing:

- Prerelease tags must point to a commit reachable from `origin/next`.
- Stable release tags must point to a commit reachable from `origin/main`.

If the ancestry check fails, the workflow should stop before `npm publish`.

## Trusted Publishing

npm Trusted Publisher remains the release authentication mechanism.

The npm package configuration should stay:

- Publisher: GitHub Actions
- Repository: `Yiyuiii/codex-cc-reviewer`
- Workflow filename: `release.yml`
- Environment: empty

The workflow should use GitHub-hosted runners with:

- `permissions.id-token: write`
- Node 24 or newer
- npm 11.5.1 or newer

The publish step should explicitly request provenance so npm uses GitHub Actions OIDC Trusted Publishing:

```yaml
- run: npm publish --ignore-scripts --provenance --tag "$NPM_TAG" --access public
```

Do not set or clear `NODE_AUTH_TOKEN` for the release job. The workflow should not depend on a long-lived npm token, and `--provenance` is the explicit signal for the trusted-publishing path.

## v0.2.0 Handling

The already pushed `v0.2.0` tag should not be moved.

Next steps after implementing this design:

1. Create `next` from the current repository state.
2. Update workflows on `next`.
3. Publish and validate `v0.2.1-rc.0` from `next`.
4. If prerelease validation succeeds, merge `next` into `main`.
5. Publish `v0.2.1` from `main`.

## Verification

For prereleases:

- GitHub Actions CI passes on `next`.
- Release workflow publishes to npm `next`.
- `npm view codex-cc-reviewer dist-tags` shows the prerelease under `next`.
- `npx -y codex-cc-reviewer@next --version` reports the prerelease version.

For stable releases:

- GitHub Actions CI passes on `main`.
- Release workflow publishes to npm `latest`.
- `npm view codex-cc-reviewer version` reports the stable version.
- `npx -y codex-cc-reviewer@latest --version` reports the stable version.

## Deferred

This design does not add release PR automation, changelog generation, or npm token fallback. Those can be considered later if the branch model proves stable.
