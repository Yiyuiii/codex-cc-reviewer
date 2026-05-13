# codex-cc-reviewer

[English](README.md) | [简体中文](README.zh-CN.md)

让 Codex 通过 MCP 调用 Claude Code 做外部审查。

**Codex 实现。Claude 审查。Codex 决定。**

`codex-cc-reviewer` 是一个聚焦的 MCP server，适合把 Codex 当主控实现者、同时希望 Claude Code 做高强度第二审查的开发者。它会 headless 启动 Claude Code，发送结构化 review packet，捕获 Claude Code 的 `stream-json` 活动，并把审查结果返回给 Codex。

## 为什么

- 编码前审查实现计划。
- 最终回复或提交前审查 diff。
- 对高风险变更做 adversarial review。
- 保持 Codex 主控，而不是做泛化多 agent bridge。
- 能看到 Claude Code 做了什么：工具活动、结构化 timeline、transcript 片段、缓存诊断和成本。

## 安装

```bash
npm install -g codex-cc-reviewer
codex-cc-reviewer install
codex-cc-reviewer doctor
```

## 手动配置 Codex

```toml
[mcp_servers.codex_cc_reviewer]
command = "npx"
args = ["-y", "codex-cc-reviewer", "serve"]
startup_timeout_sec = 20
tool_timeout_sec = 900
required = false
enabled = true
enabled_tools = ["cc_review"]
```

## 用法

你可以对 Codex 说：

> 实现这个功能，但编码前先让 Claude Code 审阅计划；编码后再让 Claude Code 审阅 diff。

MCP server 只暴露一个工具：`cc_review`。

```json
{
  "task": "review_diff",
  "prompt": "请重点审查正确性、回归风险和遗漏测试。",
  "context": "请审阅当前改动。",
  "includeGitDiff": true
}
```

本地 CLI 测试：

```bash
codex-cc-reviewer review --task review_plan --prompt "审查这个计划" --context "..."
```

## 默认策略

这个包默认面向可信本地 owner workflow：

- `model`: `opus`
- `effort`: `max`
- `permissionMode`: `bypassPermissions`
- `tools`: `default`
- `stream`: `true`
- `cacheTtl`: `1h`
- `redactSecrets`: `false`

默认尽量按原文传递 review packet。脱敏是可选项，因为改写文本可能会破坏有用证据。

## Codex 会收到什么

最终 MCP 结果包含：

- Claude 的审查正文
- Claude Code 最近的工具/活动事件
- 结构化 activity timeline
- stream 输出里的最近 transcript 片段
- Claude 报告的 prompt cache creation/read token 与 cache effective 状态
- 诊断信息，例如缺少 MCP progressToken 或 cache usage 未报告
- Claude 报告的成本

Claude Code 运行期间，如果 Codex MCP client 在请求里提供 `progressToken`，server 会发送 `notifications/progress`。如果 Codex 没有提供 token，最终 detail 仍会包含完整捕获到的 timeline，并在 diagnostics 里说明实时 progress 不可用。

## 安全

默认模式非常强。只在你控制的可信仓库、VM、dev container 或本地工作区中使用。需要收窄时，显式覆盖 `permissionMode`、`tools` 和 `redactSecrets`。

更多信息见 [docs/security.md](docs/security.md) 和 [docs/tool-contract.md](docs/tool-contract.md)。
