# 更新日志

## 未发布

- 暂无条目。

## 1.0.0-rc.0

此 release candidate 相比 0.3.1 不引入 breaking behavior 或 API 变更。它开启 1.x 稳定线：受支持的 `cc_review` MCP 输入/输出字段、CLI 命令、package manifest，以及 GitHub Actions 发布流程在 1.x 期间应保持向后兼容，除非未来 changelog 明确标记 breaking change。

- 声明初始 1.0 release candidate，覆盖受支持的 `cc_review` MCP 输入/输出契约、CLI 命令、package manifest，以及 GitHub Actions 发布流程。
- 将 `codex-cc-reviewer@next` 标记为 1.0.0 release-candidate 线；稳定版 `latest` 提升仍需通过本地 Codex 验证 gate。
- 扩展 Claude Code cache diagnostics，在 Claude Code 报告时展示剩余未缓存输入 token，以及 1 小时/5 分钟 cache creation buckets。
- 新增 release assurance 测试，保持 CLI 与 MCP server 版本和 package metadata 对齐。
- 新增 maintainer-only 的 `npm run research:cache-repeat` harness，用于重复调用 `claude -p` 的 cache 实验，且不把 packet 内容嵌入 argv 或 JSON summary。
- 记录 packet reorder 仍未实现，直到 cache ground-truth 证据表明它能显著降低重复调用成本。
- 澄清 `cacheTtl: "5m"` 表示本工具未请求 1 小时 cache hint，并不证明 Claude Code 上游请求没有发生 1 小时 cache 活动。

## 0.3.1

- 在重启后的本地 Codex 会话中验证已发布到 npm `next` 的包后，提升 `v0.3.1-rc.0`。
- 确认重启后的 `review_diff` smoke 覆盖 tracked diff routing、精选 untracked text evidence，以及 best-effort redaction。
- 继续将已文档化的 GitHub Actions Trusted Publishing 流程作为唯一真实 npm 发布路径；本地 npm 发布仍只用于 dry-run 验证。

## 0.3.1-rc.0

- 为无法解析成逐文件 `diff --git` block 的非空 git diff 增加 raw fallback evidence，避免审查证据静默丢失。
- 为非空但不可解析的 git diff、以及部分 diff block 被丢弃的场景增加 packet diagnostics，同时避免把原始 diff 内容回显进 diagnostics。
- 将不可解析 diff fallback evidence 渲染为文本，并一致地转义 manifest change-summary 单元格。
- 修复 security 与 README 文档中围绕 `0.3.x` 状态和 diff-oriented git evidence 默认值的漂移。
- 对未来 headline 行为涉及 diff routing 或 packet evidence 的 release，要求本地 Codex `review_diff` smoke 覆盖。

## 0.3.0

- 在重启后的本地 Codex 会话中验证 `v0.3.0-rc.0` 后，提升 Review Evidence Routing。
- 保持 `claude -p` 作为受支持的 review backend，同时保留 maintainer-only 的 background-mode research harness。
- 纳入 `0.3.0` release candidate 中的 doctor hardening 和 release validation evidence。

## 0.3.0-rc.0

此 release candidate 用于在稳定提升前验证三个 bundled 领域：
Review Evidence Routing、doctor hardening，以及 maintainer background-mode research harness。

- 升级说明：启用 git auto-discovery 时，`review_diff` 和 `adversarial_review` 现在默认嵌入精选 untracked text file bodies。这可能包含本地未跟踪且未忽略的文件，例如 `.env`、`.env.local`、`*.pem`、`id_rsa*`、`kubeconfig`、`.aws/credentials` 或 debug dumps。设置 `includeUntrackedContent: false` 可让 untracked 文件只显示路径，或设置 `redactSecrets: true` 启用 best-effort content redaction。
- 在验证 `claude --bg` 可以审查但尚未提供同等稳定的完整结果表面后，继续将 `claude -p` 作为受支持的 review backend。
- 为低于已验证最低版本的 Claude Code、以不同 Claude Code 版本启动的 daemon workers、以及被阻塞的 background jobs 增加 non-fatal `doctor` warnings。
- 新增 maintainer-only 的 `npm run research:bg-ab` harness，用于未来对 Plan-profile 的 `claude -p` 与 `claude --bg` 进行 A/B 验证。
- 新增 Review Evidence Routing，用于 diff-oriented reviews：按风险优先路由 tracked diff、默认精选 untracked text bodies、透明 tracked/untracked manifests，以及面向 binary/generated/build/dependency evidence 的 review-quality filters。
- 新增 `includeUntrackedContent` 和 `codex-cc-reviewer preview`，让用户可以禁用 untracked body embedding，或在不启动 Claude Code 的情况下检查准确的 review packet。

## 0.2.3

- 在重启后的本地 Codex 会话中验证 `v0.2.3-rc.0` 后，提升 release assurance hardening。
- 新增标准 release preflight scripts，覆盖 typecheck、tests、build、npm pack dry-run 和 CLI smoke checks。
- 通过 concurrency cancellation、job timeout、pack/CLI smoke checks、npm pack manifest validation，以及短期 package evidence artifacts 强化 CI。
- 通过 package-version/tag matching、兼容 CRLF 的 stable local Codex validation evidence、npm publish verification，以及 GitHub Release creation 强化 release publishing。
- 记录最终 `cc_review` diff review 前必需的 `testsRun`、`codexSummary` 和 `knownRisks` evidence。

## 0.2.3-rc.0

- 为 CI、npm package verification、release publishing 和 local Codex validation evidence 增加 release assurance hardening。
- 将此 prerelease 发布到 npm `next`，用于在稳定提升前进行真实 Codex restart validation。

## 0.2.2

- 在重启后的本地 Codex 会话中验证 `0.2.2-rc.0` 后，提升 `install --package-spec <spec>`。
- 支持配置 Codex 加载 prerelease MCP packages，例如 `codex-cc-reviewer@next`。
- 在 `doctor` 输出中显示 non-default configured MCP package specs。

## 0.2.2-rc.0

- 新增 `install --package-spec <spec>`，让 prerelease validation 可以将 Codex 指向 `codex-cc-reviewer@next`。
- 当可检测时，在 `doctor` 输出中显示已配置的 MCP package spec。
- 在稳定提升前记录 local Codex rc validation flow。

## 0.2.1

- 在 npm `next` 上验证 `v0.2.1-rc.0` 后，提升 branch-aware release workflow。
- 从 `main` 将 stable tags 发布到 npm `latest`，并使用 GitHub Actions OIDC Trusted Publishing provenance。
- 稳定提升前继续在 `next` 上进行 prerelease validation。

## 0.2.1-rc.0

- 新增 `next` prerelease branch workflow，用于在稳定发布前验证 npm Trusted Publishing。
- 将 `v0.2.1-rc.0` 等 prerelease tags 路由到 npm `next` dist-tag。
- 新增 release workflow channel resolution、tag-trigger guard、branch ancestry checks 和显式 npm provenance publishing。

## 0.2.0

- 为 diff-oriented reviews 新增 git diff parsing 和 context routing。
- 用 `Changed Files Manifest`、`Context Routing Guidance` 和 `Routed Git Diff Evidence` 替换单体 diff packet insertion。
- 小型 source diffs 完整包含；大型 source diffs 以保留头尾的方式部分包含；binary/generated/lockfile/build-output diffs 不嵌入正文，但仍保留在 manifest 中可见。
- 保留 0.1.6 的 deep Claude Code 默认值：`opus`、`max`、dangerous trusted-local permission mode、default tools、无 cost cap、无 turn cap。
- 记录 Codex/Claude 取舍：Codex 发送可靠地图和精选证据；Claude Code 在需要时检查 partial 或 omitted files。

## 0.1.6

- 移除公开的 `maxTurns` 和 `maxBudgetUsd` review caps；`cc_review` 不再向 Claude Code 转发 cost 或 turn limits。
- 让 `cc_review` input 严格校验，使已移除或未知字段 loud failure，而不是静默忽略。
- 新增 lightweight Git Evidence Summary，包括 diff stat、name-status 和 untracked manifest。
- 对过大的 review packet blocks 从中间截断，同时保留开头和结尾。
- 将 timeout 记录为 service hang protection，而不是 model capability limit。

## 0.1.5

- 停止传入默认 Claude Code `--max-turns` 限制。
- 保留 `maxTurns` 作为显式 budget-control option。
- 记录 turn limits 是 opt-in，因为 review turns 可能是较小的 exploratory actions。

## 0.1.4

- 新增 original goal、review focus、Codex summary、acceptance criteria、known risks 和 tests run 的结构化 packet 字段。
- 将 `prompt` 视为 `reviewFocus` 的 backward-compatible alias。
- 为 `review_diff` 和 `adversarial_review` 自动发现 git evidence。
- 将 diff collection 切换到 `git diff --no-ext-diff HEAD`，以包含 staged tracked changes。
- 将 status collection 切换到 `git status --porcelain=v2`。
- 当 diff review 没有发现 git evidence 时增加 packet diagnostics。
- 扩展 JSON review schema，加入 optional evidence、impact、confidence、blocking 和 verification 字段。

## 0.1.3

- 通过将内部 cancellation signals 映射到 `cancelSignal`，修复 execa v9 下真实 Claude Code 执行。
- 为 execa option mapping 增加 regression test。

## 0.1.2

- 新增结构化 Claude Code activity timeline output。
- 当 client 提供 `progressToken` 时，新增 MCP progress notifications。
- 新增 hit、cold write、disabled 和 unreported 状态的 cache effective diagnostics。
- 通过 incremental parser 流式处理 Claude Code stdout，同时保留 buffered fallback tests。
- 将 MCP cancellation signals 接入 Claude Code execution。
- 记录 progress-token 和 cache-reporting limitations。

## 0.1.1

- 默认保留 review packet text；redaction 为 opt-in。
- 新增来自 Claude Code stream output 的 transcript snippets。
- 将生成的 Codex config 改为 `required = false`。
- 改进英文和中文 README 页面，加入 language links。
- 明确要求 Claude 在最终回复中包含完整 review。

## 0.1.0

- 初始 MCP stdio server，包含 `cc_review`。
- Claude Code headless runner。
- 本地 `review` CLI command。
- `install`、`uninstall` 和 `doctor` commands。
- 默认 deep autonomous review：`opus`、`max`、`bypassPermissions`、`default` tools。
- 在最终 review output 中捕获 stream-json activity。
- 1 小时 prompt cache TTL hint。
- 默认传输 raw packet；redaction 为 opt-in。
- Codex install config 使用 `required = false`。
