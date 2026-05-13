# Tool Contract

## `cc_review`

Runs Claude Code as an external reviewer.

Input:

- `task`: `review_plan`, `review_diff`, `review_doc`, or `adversarial_review`
- `context`: required review context
- `prompt`: optional extra goal
- `model`: default `sonnet`
- `effort`: default `high`
- `output`: `markdown` or `json`
- `permissionMode`: `default`, `plan`, or `dontAsk`; default `plan`
- `tools`: string or array; default `["Read"]`
- `maxTurns`: default `8`
- `maxBudgetUsd`: optional
- `cwd`: optional working directory
- `includeGitDiff`: default `false`
- `includeGitStatus`: default `false`

Output:

- `ok`
- `task`
- `model`
- `elapsedMs`
- `review`
- `structured`
- `command`
- `stderrTail`
- `exitCode`

