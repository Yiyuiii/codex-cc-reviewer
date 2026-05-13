# codex-cc-reviewer

[English](README.md) | [简体中文](README.zh-CN.md)

[![npm version](https://img.shields.io/npm/v/codex-cc-reviewer.svg)](https://www.npmjs.com/package/codex-cc-reviewer)
[![CI](https://github.com/Yiyuiii/codex-cc-reviewer/actions/workflows/ci.yml/badge.svg)](https://github.com/Yiyuiii/codex-cc-reviewer/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js >=20](https://img.shields.io/badge/node-%3E%3D20-339933.svg)](https://nodejs.org/)

通过 MCP 让 Claude Code 成为 Codex 的第二审查者。

**Codex 实现。Claude 审查。Codex 决定。**

`codex-cc-reviewer` 适合把 Codex 当主要实现 agent、同时希望 Claude Code 在继续推进前审查计划、diff、高风险设计选择和安全敏感变更的开发者。

它故意保持很窄：

- 只暴露一个 MCP 工具：`cc_review`
- Claude Code 作为本地审查子进程运行
- Codex 仍然负责调度和最终决策
- 不做泛化的双向 agent bridge

状态：早期 `0.2.x`。核心流程可用，但项目仍是 pre-1.0，并且会刻意保持聚焦。

Proof of work：本项目约 99% 由 Codex 开发和维护；Claude Code / Opus 通过 `cc_review` 作为建议性审查者参与。

## 为什么

- 编码前审查实现计划。
- 最终回复或提交前审查 diff。
- 对高风险变更做 adversarial review。
- 保持 Codex 主控，而不是做一个泛化多 agent bridge。
- 能看到 Claude Code 做了什么：工具活动、结构化 timeline、transcript 片段、缓存诊断和成本。
- 给 Claude Code 传递紧凑的 git 证据地图，而不是盲目把所有 diff 字节塞进 packet。

## Opus 的具体使用场景

这个项目明确偏向 Opus。默认 `model: "opus"` 不是偶然选择：这个 bridge 的价值前提是 Claude Code 的审查信号强到值得消耗 Opus 级别预算。你可以覆盖成其他 Claude Code model，但那不是本项目的核心价值。

截至 2026 年 5 月，真正的动机是一个具体且主观的观察：在作者的 Claude Plan 工作流里，Opus 系列自 Opus 4.6 时代从过去约 200K context 的工作方式被强制切到 1M context 工作方式后，作为连续自主编码 agent 的可靠性明显下降。这个 failure mode 在作者的长时间编码 session 中稳定复现：Opus 可能忘记前面上下文已经得出的结论，没读过代码却推断实现，或者在验证仓库证据之前急于收尾。在形成这个工具需求的那一个月里，实际表现是更多未检查代码的猜测，以及更不稳定的上下文延续。

这并不代表 Opus 没价值，而是说明它更适合被放在别的位置。`codex-cc-reviewer` 把 Claude Code / Opus 额度花在边界清晰的评审任务上：挑战计划、检查 diff、指出遗漏风险、提供亮点。它的输出不需要被完全遵守。Codex 负责保留任务状态、实现、验证，并决定哪些 Opus 发现接受、拒绝或延后。

## 适合谁

适合以下情况：

- Codex 是你的主要实现 agent。
- 你希望 Claude Code 做第二审查者，而不是主要编码者。
- 你明确希望把 Claude Code Opus 额度花在审查信号上，而不是连续执行上。
- 你见过 Opus 在长时间 AI 编码 session 中漂移、没读代码就猜实现，或急于跳过验证。
- 你希望在编码前、最终回复前或提交前加入审查。
- 你希望 Codex 综合 Claude 的反馈，而不是默认照单全收。

## 不适合

这不是：

- 通用 Claude Code 和 Codex 双向桥接
- GitHub PR review bot 或只在 CI 中运行的审查器
- 多 agent 辩论框架
- 让 Claude Code 作为主要实现 agent 的工具
- 可安全用于不可信仓库或共享机器的默认方案
- 让 Claude 的审查自动成为权威结论的工具

## 前置要求

- Node.js 20 或更新版本
- npm
- Claude Code CLI 已安装、在 `PATH` 上，并已完成本地认证
- 支持 MCP 的 Codex
- 可信的本地仓库、VM 或 dev container

使用本工具前，请先交互式运行一次 Claude Code，确保本地认证已经就绪。

## 快速开始

如果你已经在 Codex 或其他本地 coding agent 里工作，可以让它先读取本 README，然后代你安装：

下面的 prompt 保持英文，方便 agent 直接执行：

```text
Read this README. Then run exactly these commands:
npm install -g codex-cc-reviewer
codex-cc-reviewer install
codex-cc-reviewer doctor

Afterward, verify the MCP config changed as expected and report any files or settings you changed. Do not invent extra setup steps. Do not use sudo.
```

手动安装：

```bash
npm install -g codex-cc-reviewer
codex-cc-reviewer install
codex-cc-reviewer doctor
```

安装后重启 Codex。默认 permission mode 是 `bypassPermissions`；在共享或敏感环境使用前，请先阅读[安全与配置](#安全与配置)。

然后对 Codex 说：

> 实现这个功能前，先调用 `cc_review` 让 Claude Code 审查计划。实现后，再调用 `cc_review` 审查 diff。

预期流程：

1. Codex 起草计划或准备 diff 上下文。
2. Codex 调用 MCP 工具 `cc_review`。
3. `codex-cc-reviewer` 在你的本地环境中 headless 启动 Claude Code。
4. Claude Code 审查 packet 后退出。
5. Codex 收到一次 MCP 结果，其中包含 Claude 的审查、最近活动、timeline、transcript、缓存、诊断和成本信息（如果 Claude Code 报告了这些信息）。

Codex 应该把这个结果当作审查意见，而不是事实本身。

如果你希望 Codex 在计划和 diff 阶段自动调用 `cc_review` 做收敛审查，见 [docs/codex-usage.md](docs/codex-usage.md) 和 [examples/codex-global-prompt.md](examples/codex-global-prompt.md)。

## 手动配置 Codex

如果你更想手动配置，把下面内容加入 `~/.codex/config.toml` 或可信项目的 `.codex/config.toml`：

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

修改 MCP 配置后请重启 Codex。更多说明见 [docs/manual-setup.md](docs/manual-setup.md)。

## 安全与配置

默认模式非常强，面向可信本地 owner workflow：

- `model`: `opus`
- `effort`: `max`
- `permissionMode`: `bypassPermissions`
- `tools`: `["default"]`，这是 MCP 输入的 canonical 形式；本地 CLI 也接受逗号分隔字符串
- `stream`: `true`
- `cacheTtl`: `1h`
- `redactSecrets`: `false`

当 `permissionMode: "bypassPermissions"` 时，本工具会用 `--dangerously-skip-permissions` 调用 Claude Code。只应在你控制的仓库、VM、dev container 或本地工作区中使用。

下面是配置示例，不是内置 profile 名称：

| 使用场景 | 建议字段 | 说明 |
| --- | --- | --- |
| 可信本地 owner workflow | `permissionMode: "bypassPermissions"`、`tools: ["default"]`、`redactSecrets: false` | 适合你自己的仓库、VM 或 dev container，并尽量保留原始审查证据。 |
| 保守审查 | `permissionMode: "plan"` 或 `"default"`、`tools: ["Read", "Grep", "Glob"]`、`redactSecrets: true` | 适合敏感或共享仓库，让审查尽量保持只读。 |
| 大上下文审查 | 默认设置，可选更高的 `maxContextChars` | review packet 使用较大的上下文预算，并在超大内容块中保留开头和结尾。 |

默认会尽量按原文传递 review packet。`redactSecrets: true` 会启用 best-effort 脱敏，但它并不全面，也可能删除有用证据。

`cc_review` 不再暴露成本或 turn 上限。timeout 仍然保留，但它是防止服务挂死的保护，不是 Claude Code 能力限制。

超大的 packet 内容块会从中间截断，同时保留开头和结尾。这样既保留结构和最新证据，又避免 packet 无限制增长。

### Git 上下文路由

对于 `review_diff` 和 `adversarial_review`，v0.2 不再把 diff 当作一个巨大文本块直接塞进 packet，而是先做证据路由。packet 会包含：

- `Git Evidence Summary`：diff stat、name-status 和 untracked 文件清单。
- `Changed Files Manifest`：文件、状态、纳入方式（`full`、`partial`、`omitted`）、变更行数和路由原因。
- `Context Routing Guidance`：明确告诉 Claude Code 何时需要用自己的工具检查 partial 或 omitted 文件。
- `Routed Git Diff Evidence`：被选中的逐文件 diff 证据。

这个取舍是有意的：Codex 负责提供可靠地图和足够启动审查的证据；Claude Code 再把自己的工具调用花在真正重要的文件上，而不是被一个巨大、无结构的 diff dump 占满上下文。生成物路径、lockfile、dist/build 输出和二进制 diff 默认会出现在 manifest 里，但不会进入 diff body。

完整安全说明见 [docs/security.md](docs/security.md)。

## 使用场景

### 实现前审查

对 Codex 说：

> 先起草实现计划。编码前调用 `cc_review`，使用 `task: "review_plan"`，让 Claude Code 查找遗漏步骤、风险假设和更简单的替代方案。

### 审查当前 diff

对 Codex 说：

> 最终确认前，让 Claude Code 审查当前 diff。重点关注正确性、回归风险和遗漏测试。

### 对抗性审查

对 Codex 说：

> 让 Claude Code 做 adversarial review。挑战当前设计，尤其关注 auth、数据丢失、回滚、竞态条件和可靠性。

### 安全敏感变更

对 Codex 说：

> 修改 auth 或权限逻辑前，让 Claude Code 审查计划和最终 diff，并使用更保守的 permission mode。

### 审查文档或架构

对 Codex 说：

> 实现前，让 Claude Code 审查这份设计文档，重点找歧义、缺乏依据的假设和迁移风险。

收到审查后的综合建议见 [docs/codex-usage.md](docs/codex-usage.md)。

## 直接工具输入

MCP server 只暴露一个工具：`cc_review`。

```json
{
  "task": "review_diff",
  "originalGoal": "增加更安全的发布流程。",
  "reviewFocus": "请重点审查正确性、回归风险和遗漏测试。",
  "codexSummary": "更新了发布文档和 package metadata。",
  "testsRun": ["npm test: passed"],
  "context": "请审阅当前改动。"
}
```

启用 git discovery 时，工具会自动加入轻量 Git Evidence Summary：diff stat、name-status 和 untracked 文件清单。对于 `review_diff` 和 `adversarial_review`，工具还会默认收集原始 git status 和 `git diff HEAD` 证据，除非设置 `autoDiscoverGit: false`；diff 会被路由成 manifest 加逐文件精选证据。`prompt` 仍然可用，但现在只是 `reviewFocus` 的兼容别名。

本地 CLI 测试（`--review-focus` 可选，但通常有用）：

```bash
codex-cc-reviewer review --task review_plan --review-focus "审查这个计划" --context "..."
```

完整输入和输出字段见 [docs/tool-contract.md](docs/tool-contract.md)。

## Codex 会收到什么

最终 MCP 结果会包含 Claude 的审查正文、Claude Code 最近的活动事件、结构化 activity timeline、最近 transcript 片段、prompt cache token 和有效缓存状态（如果有报告）、诊断信息以及成本（如果有报告）。

简化示例：

```json
{
  "ok": true,
  "task": "review_diff",
  "model": "opus",
  "elapsedMs": 42100,
  "review": "The main risk is ...",
  "command": ["claude", "-p", "Review the packet provided on stdin.", "..."],
  "eventsTail": ["tool_use: Read {\"file_path\":\"README.md\"}", "result"],
  "activityTail": [
    {
      "index": 12,
      "kind": "tool_use",
      "rawType": "assistant",
      "summary": "Read README.md",
      "toolName": "Read"
    }
  ],
  "transcriptTail": ["Claude inspected the diff and focused on correctness."],
  "eventCount": 128,
  "cache": {
    "creationInputTokens": 1234,
    "readInputTokens": 5678,
    "effective": "hit"
  },
  "diagnostics": ["MCP progress unavailable: request did not include _meta.progressToken."],
  "costUsd": 0.42,
  "exitCode": 0
}
```

Claude Code 运行期间，如果 Codex MCP client 在请求里提供 `progressToken`，server 会发送 `notifications/progress`。如果 Codex 没有提供 token，最终 detail 仍会包含完整捕获到的 timeline，并在 diagnostics 里说明实时 progress 不可用。

## 排错

运行：

```bash
codex-cc-reviewer doctor
```

常见问题：

- 找不到 `claude`：安装 Claude Code，并确认它在 `PATH` 上。
- Claude 未认证：交互式运行一次 Claude Code 并完成认证。
- Codex 配置缺失：运行 `codex-cc-reviewer install`。
- Codex 没显示工具：修改 MCP 配置后重启 Codex。
- 审查超时：增加 Codex config 里的 `tool_timeout_sec`。
- Codex 只显示一次工具调用但 Claude Code 还在运行：实时 progress 需要 Codex MCP client 发送 `_meta.progressToken`。否则请查看最终 `diagnostics` 和 `activityTail` 字段。
- Cache reads 一直为 0：第一次运行可能是冷缓存写入，Claude Code 可能没有报告 usage，或者 prompt 低于模型可缓存长度。

更多信息见 [docs/troubleshooting.md](docs/troubleshooting.md)。

## 和相关项目有什么不同

`codex-cc-reviewer` 故意保持很窄。它是在本地 Codex workflow 中引入 Claude Code 审查，而不是替代任一工具。

| 项目类型 | 常见方向 | 本项目 |
| --- | --- | --- |
| Claude Code plugin for Codex | Claude Code 调用 Codex | Codex 调用 Claude Code |
| PR review bot | GitHub PR 事件触发审查 | 本地 Codex workflow 触发审查 |
| 多 agent loop | 多个 agent 自动辩论或迭代 | Claude 审查一次，Codex 综合判断 |
| 泛化 bridge | 多工具、双向委派 | 一个 MCP 工具：`cc_review` |

相关工作和范围边界见 [docs/prior-art.md](docs/prior-art.md)。

## 文档

- [安装](docs/installation.md)：安装命令和前置要求。
- [手动配置](docs/manual-setup.md)：Codex MCP 配置片段。
- [Codex 用法](docs/codex-usage.md)：何时调用 `cc_review`，以及如何综合反馈。
- [工具契约](docs/tool-contract.md)：完整 MCP 输入和输出字段。
- [安全](docs/security.md)：默认权限姿态和更安全的设置。
- [排错](docs/troubleshooting.md)：常见配置问题。
- [相关工作](docs/prior-art.md)：相关 workflow 和项目范围。
- [示例](examples)：示例 Codex 配置、AGENTS 指引、synthesis packet 和全局 prompt。
- [更新日志](CHANGELOG.md)：发布记录。
- [安全策略](SECURITY.md)：漏洞报告范围。

## 贡献

欢迎贡献，但请保持项目聚焦：更好的 prompts、更安全的默认值、安装支持、Claude CLI 解析、测试和文档。

见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

[MIT](LICENSE)
