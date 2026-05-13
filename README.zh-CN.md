# codex-cc-reviewer

让 Codex 从 MCP 调用 Claude Code 做外部审阅。

Codex 实现。Claude 挑错。Codex 决定。

`codex-cc-reviewer` 是一个很窄的 Codex 侧 MCP server。它会用 headless 模式启动 Claude Code，把稳定的 review packet 交给 Claude 审阅，然后把结果返回给 Codex。

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
required = true
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
  "context": "请审阅当前改动是否有回归风险。",
  "includeGitDiff": true
}
```

也可以不经过 Codex，直接本地测试：

```bash
codex-cc-reviewer review --task review_plan --context "请审阅这个实现计划..."
```

## 安全默认值

默认使用 Claude Code 的 `plan` 权限模式，只启用 `Read` 工具，并拒绝 `bypassPermissions`。Claude 只是 reviewer 子进程，不是主控 agent。

