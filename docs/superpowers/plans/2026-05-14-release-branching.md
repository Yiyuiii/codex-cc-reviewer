# Release Branching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `next` prerelease branch and make GitHub Actions publish prerelease tags to npm `next` and stable tags to npm `latest`.

**Architecture:** Keep a single `release.yml` trusted-publishing workflow, but derive the npm dist-tag from the pushed git tag. Add ancestry checks so prerelease tags must come from `origin/next` and stable tags must come from `origin/main`. CI runs on both `next` and `main`.

**Tech Stack:** GitHub Actions YAML, npm trusted publishing/OIDC, npm semver prerelease versions, existing TypeScript/Node test suite.

---

### Task 0.5: Accepted Plan Review Fixes

Claude Code reviewed this plan before implementation. Accepted fixes:

- [x] Do not use shallow fetch for ancestry checks; it breaks `git merge-base --is-ancestor`.
- [x] Fetch only the required branch for the current channel, not both `main` and `next`.
- [x] Do not clear `NODE_AUTH_TOKEN`; use explicit `npm publish --provenance` for OIDC trusted publishing.
- [x] Keep `--access public` in publish command.
- [x] Keep `workflow_dispatch`, but add a guard that fails unless the run is tag-triggered.
- [x] GitHub canonical repository casing is `Yiyuiii/codex-cc-reviewer`; npm Trusted Publisher UI matches this and has no environment constraint per user confirmation.
- [x] The design/spec commit will first travel on `next`; it reaches `main` only during the stable fast-forward promotion.

---

### Task 1: Update CI Branch Coverage

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] Change the push branch list from `[main, master]` to `[main, next]`.
- [ ] Keep pull request CI enabled.
- [ ] Do not change the Node matrix `[20, 22, 24]`.
- [ ] Verify with `git diff -- .github/workflows/ci.yml`.

Expected diff shape:

```diff
-    branches: [main, master]
+    branches: [main, next]
```

### Task 2: Update Release Workflow

**Files:**
- Modify: `.github/workflows/release.yml`

- [ ] Keep `on.push.tags: ["v*"]`.
- [ ] Keep `workflow_dispatch`, but add a guard so manual non-tag runs cannot publish.
- [ ] Keep `permissions.contents: read` and `permissions.id-token: write`.
- [ ] Change checkout to fetch enough history for ancestry checks:

```yaml
- uses: actions/checkout@v5
  with:
    fetch-depth: 0
```

- [ ] Add a shell step after setup-node to compute the npm dist-tag and expected branch:

```yaml
- name: Require tag trigger
  if: github.ref_type != 'tag'
  shell: bash
  run: |
    echo "::error::This workflow must be triggered by a tag push"
    exit 1
```

```yaml
- name: Resolve release channel
  id: channel
  shell: bash
  run: |
    set -euo pipefail
    TAG="${GITHUB_REF_NAME}"
    if [[ "$TAG" == *-* ]]; then
      echo "npm_tag=next" >> "$GITHUB_OUTPUT"
      echo "required_branch=origin/next" >> "$GITHUB_OUTPUT"
    else
      echo "npm_tag=latest" >> "$GITHUB_OUTPUT"
      echo "required_branch=origin/main" >> "$GITHUB_OUTPUT"
    fi
```

- [ ] Add a shell step before `npm publish` to enforce tag ancestry:

```yaml
- name: Verify tag ancestry
  shell: bash
  run: |
    set -euo pipefail
    REQUIRED_BRANCH="${{ steps.channel.outputs.required_branch }}"
    git fetch origin "${REQUIRED_BRANCH#origin/}"
    if ! git merge-base --is-ancestor "$GITHUB_SHA" "$REQUIRED_BRANCH"; then
      echo "::error::Tag $GITHUB_REF_NAME at $GITHUB_SHA is not reachable from $REQUIRED_BRANCH"
      exit 1
    fi
```

- [ ] Change publish to use the resolved dist-tag, explicit provenance, and public access:

```yaml
- run: npm publish --provenance --tag "${{ steps.channel.outputs.npm_tag }}" --access public
```

- [ ] Keep `npm ci`, `npm run typecheck`, `npm test`, and `npm run build`.

### Task 3: Create `next` Branch and Push Workflow Changes

**Files:**
- No new source files.

- [ ] Create or switch to local `next` from current HEAD:

```powershell
git switch -c next
```

If `next` already exists locally, use:

```powershell
git switch next
git merge --ff-only main
```

- [ ] Commit workflow changes:

```powershell
git add .github/workflows/ci.yml .github/workflows/release.yml
git commit -m "ci: add next prerelease channel"
```

- [ ] Push `next`:

```powershell
git push -u origin next
```

### Task 4: Prepare `v0.2.1-rc.0`

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/index.ts`
- Modify: `src/mcp/server.ts`
- Modify: `CHANGELOG.md`

- [ ] Bump version metadata to `0.2.1-rc.0`:

```powershell
npm version 0.2.1-rc.0 --no-git-tag-version
```

- [ ] Update `src/index.ts` and `src/mcp/server.ts` version strings to `0.2.1-rc.0`.
- [ ] Add a `0.2.1-rc.0` changelog entry explaining release workflow validation.
- [ ] Run:

```powershell
npm run typecheck
npm test
npm run build
npm pack --dry-run --json
node dist/index.js --version
```

Expected version output:

```text
0.2.1-rc.0
```

- [ ] Commit:

```powershell
git add package.json package-lock.json src/index.ts src/mcp/server.ts CHANGELOG.md
git commit -m "chore: prepare 0.2.1-rc.0"
```

### Task 5: Publish and Verify Prerelease

**Files:**
- No new source files.

- [ ] Tag and push prerelease from `next`:

```powershell
git tag v0.2.1-rc.0
git push origin next
git push origin v0.2.1-rc.0
```

- [ ] Watch the Release workflow:

```powershell
gh run list --repo Yiyuiii/codex-cc-reviewer --workflow Release --limit 3
gh run watch <run-id> --repo Yiyuiii/codex-cc-reviewer --exit-status
```

- [ ] Verify npm:

```powershell
npm view codex-cc-reviewer dist-tags --json
npm view codex-cc-reviewer@next version
npx -y codex-cc-reviewer@next --version
```

Expected prerelease version:

```text
0.2.1-rc.0
```

### Task 6: Promote to Stable `v0.2.1`

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/index.ts`
- Modify: `src/mcp/server.ts`
- Modify: `CHANGELOG.md`

- [ ] Bump version metadata on `next` to `0.2.1`:

```powershell
npm version 0.2.1 --no-git-tag-version
```

- [ ] Update `src/index.ts` and `src/mcp/server.ts` version strings to `0.2.1`.
- [ ] Add or update a `0.2.1` changelog entry explaining the branch-aware release workflow.
- [ ] Run:

```powershell
npm run typecheck
npm test
npm run build
npm pack --dry-run --json
node dist/index.js --version
```

Expected version output:

```text
0.2.1
```

- [ ] Commit:

```powershell
git add package.json package-lock.json src/index.ts src/mcp/server.ts CHANGELOG.md
git commit -m "chore: prepare 0.2.1"
```

- [ ] Push `next`, fast-forward `main`, and push `main`:

```powershell
git push origin next
git switch main
git merge --ff-only next
git push origin main
```

- [ ] Tag and push stable release from `main`:

```powershell
git tag v0.2.1
git push origin v0.2.1
```

- [ ] Watch Release workflow and verify npm:

```powershell
npm view codex-cc-reviewer version
npm view codex-cc-reviewer dist-tags --json
npx -y codex-cc-reviewer@latest --version
```

Expected stable version:

```text
0.2.1
```

### Task 7: Final Checks

**Files:**
- No new source files.

- [ ] Confirm local branch is `next` for future maintenance:

```powershell
git switch next
git status --short --branch
```

- [ ] Confirm GitHub releases:

```powershell
gh release list --repo Yiyuiii/codex-cc-reviewer --limit 5
```

- [ ] If GitHub Release is not auto-created, create release notes manually for `v0.2.1`.
