# Review Evidence Routing Design

## Goal

Make `0.3.0` improve review quality by sending Claude Code higher-value repository evidence before lower-value evidence when the packet budget is constrained.

The release should keep the project's trusted local owner posture: review fidelity is the primary product goal. Privacy filtering is available through `redactSecrets`, but it is not the default optimization target.

## Product Principle

`codex-cc-reviewer` is intentionally high-fidelity by default:

- Claude Code runs as a local reviewer subprocess.
- Codex remains the orchestrator and final decision-maker.
- The default workflow assumes a trusted local repository, VM, or dev container.
- `redactSecrets` remains optional and disabled by default.
- Evidence should be omitted only when it hurts review quality, corrupts the packet, or consumes budget with low signal.

Sensitive-looking evidence such as `.env`, local config, credentials-shaped filenames, or secret-related files should not be suppressed by filename alone. Those files can be exactly the evidence needed for a useful review. When `redactSecrets` is enabled, content is redacted before embedding; otherwise raw content is preserved.

## Scope

Accepted for `0.3.0`:

- Add risk-priority routing for tracked git diff files before diff body budget is consumed.
- Include selected untracked text-file contents by default for `review_diff` and `adversarial_review` when git auto-discovery is enabled.
- Add `includeUntrackedContent` so callers can disable untracked content embedding.
- Keep `review_plan` lightweight by default: include untracked path summaries but not untracked file bodies unless explicitly requested.
- Add transparent manifest reasons for tracked and untracked routing decisions.
- Add review-quality filters for binary files, generated files, lockfiles, minified assets, build output, dependency/vendor/cache output, unreadable files, symlinks, files outside the repository root, and very large files.
- Add a `preview` CLI command that prints the review packet without starting Claude Code.

Rejected for `0.3.0`:

- Default-off untracked content embedding for diff reviews. This conflicts with the project's high-fidelity review goal.
- Secret-filename hard denylists. They suppress potentially important review evidence for privacy reasons rather than review-quality reasons.

Deferred:

- Public routing override schema.
- Comprehensive secret detection beyond the existing best-effort `redactSecrets` behavior.
- Doctor diagnostics for routing behavior.
- Synthesis-template improvements.

## Tracked Diff Routing

The current router consumes diff body budget in git diff order. `0.3.0` should classify and sort parsed diff files before calling the existing full/partial/omitted inclusion logic.

Generated, lockfile, binary, minified, and build-output classifications still win over priority scoring. They remain omitted from embedded diff bodies because they are usually low-signal and high-cost for human-readable review.

Risk scoring should be deterministic and documented in manifest reasons. The first version should use explicit path/category heuristics rather than a public configuration API.

Priority tiers:

1. Reviewer infrastructure and transport: `src/mcp/**`, `src/runner/**`, `src/review/**`, `src/config/**`, CLI entrypoints, schema files, packet construction, progress, cache, and Claude invocation.
2. Release and install surface: `.github/workflows/**`, `package.json`, installer/uninstaller/doctor code, `AGENTS.md`, published docs that define user workflow. Lockfiles should remain visible in manifests but are not high-priority embedded diff bodies by default.
3. Security and configuration: security docs, config examples, permission-related docs, files with `security`, `auth`, `permission`, `secret`, `token`, `credential`, `config`, or `env` in meaningful path segments.
4. Ordinary source files.
5. Tests.
6. Documentation and examples.
7. Generated, lock, binary, minified, build, dependency, and cache output.

Within a tier, the router should prefer smaller high-signal files over very large files when budget is tight, while keeping ordering stable for equal classifications.

Manifest rows should include the final inclusion and reason, for example:

- `risk: mcp_transport; source diff within budget`
- `risk: release_workflow; truncated_to_budget`
- `risk: routine_docs; budget_exhausted`
- `risk: generated_or_lockfile; omitted`

## Untracked Content Routing

For `review_diff` and `adversarial_review`, git auto-discovery should include selected untracked text file contents by default. This closes a common review gap: a new file can be central to the change while still untracked.

For `review_plan`, auto-discovery should continue to include only the lightweight untracked path manifest unless `includeUntrackedContent` is explicitly true.

Untracked content routing should:

- Get untracked paths from `git ls-files --others --exclude-standard`.
- Resolve every path against the repository root before reading.
- Refuse to read paths that resolve outside the repository root.
- Skip symlinks rather than following them.
- Apply the same generated/build/dependency/cache classifications used by tracked routing.
- Skip known binary extensions and files whose initial bytes contain null bytes.
- Skip files above a per-file size threshold before reading the full body.
- Truncate text files that exceed the per-file embedded content budget.
- Apply `redactSecrets` before embedding only when the caller enabled it.

Untracked manifest rows should include:

- file path
- inclusion: `full`, `partial`, or `omitted`
- size or approximate bytes
- reason
- whether redaction was applied

Sensitive-looking filenames should be embedded when they pass review-quality filters. Their manifest reason should be explicit, for example:

- `untracked_text; embedded raw because redactSecrets=false`
- `untracked_text; embedded with redactSecrets=true`

## Budget Model

Untracked content should be part of `maxContextChars`; it should not grow the packet outside the user's configured context budget.

The design should avoid shrinking tracked diff evidence when no untracked content exists. A practical first version:

- Allocate untracked-content weight only when untracked embedding is enabled and at least one embeddable untracked file exists.
- Keep the existing tracked diff route budget when there is no untracked content.
- When both tracked diff and untracked content exist, route both through the same variable-block budget model with an explicit untracked weight.
- Preserve transparent diagnostics when untracked files are listed but not embedded because of budget or quality filters.

Implementation can tune exact weights during development, but tests must lock in the important behavior: untracked embedding absent means no tracked-diff budget regression.

## Preview CLI

Add:

```bash
codex-cc-reviewer preview --task review_diff --context "Preview packet"
```

The command should build and print the review packet to stdout without invoking Claude Code. It should accept the same packet-shaping options as the local `review` command where practical, including:

- `--task`
- `--context`
- `--review-focus`
- `--original-goal`
- `--codex-summary`
- `--known-risk`
- `--test-run`
- `--cwd`
- `--include-git-diff`
- `--include-git-status`
- `--disable-auto-discover-git`
- `--include-untracked-content` / `--no-include-untracked-content`
- `--redact-secrets`
- `--max-context-chars`

This command is a debugging and validation tool. It should not require Claude Code to be installed or authenticated.

## Documentation

Update user-facing docs to explain:

- `0.3.0` routes evidence by review value before packet budget is consumed.
- Untracked text content is included by default for diff-oriented reviews.
- `includeUntrackedContent` disables that behavior.
- `redactSecrets=true` is best-effort pattern redaction, not a security boundary.
- Omitted binary/generated/lock/build/dependency files are omitted for review-quality and budget reasons, not because omitted files are guaranteed irrelevant.
- Claude Code should still inspect partial or omitted files with tools when they may matter.

## Testing

Add focused tests before implementation:

- Risk-priority routing keeps high-risk files embedded when lower-risk files would otherwise consume the budget.
- Equal-priority files keep deterministic order.
- Generated, binary, lockfile, minified, build, dependency, and cache paths are classified consistently for tracked and untracked evidence.
- Untracked text files are embedded by default for `review_diff` and `adversarial_review`.
- Untracked bodies are not embedded by default for `review_plan`.
- `includeUntrackedContent=false` disables untracked body embedding.
- Untracked binary/null-byte files are omitted.
- Oversized untracked files are omitted or truncated according to budget.
- Symlinks and paths resolving outside the repository root are omitted.
- `redactSecrets=true` is applied to untracked content before embedding.
- Existing tracked-diff budget behavior does not regress when no untracked files are embedded.
- Packet output contains separate tracked and untracked manifest evidence.
- Preview CLI prints a packet and does not spawn Claude Code.

Full release verification should still use the standard preflight:

```bash
npm ci
npm run typecheck
npm test
npm run build
npm pack --dry-run --json
node dist/index.js --version
node dist/index.js --help
```

## Review Decisions

Accepted Claude Code review findings:

- Define the risk-priority heuristic before implementation.
- Treat symlink and repository-boundary checks as correctness and review-quality requirements for untracked reads.
- Specify how untracked content interacts with `maxContextChars`.
- Keep binary/generated/build/dependency filters because raw content has low review value.
- Make manifest reasons transparent.
- Include a preview CLI because it makes packet behavior inspectable without model cost.

Rejected Claude Code review findings:

- Make untracked content opt-in by default for diff reviews. The maintainer clarified that this project optimizes review fidelity over privacy-first defaults.

Deferred Claude Code review findings:

- Full secret scanner improvements.
- Public routing customization.
- Broader workflow and doctor diagnostics.
