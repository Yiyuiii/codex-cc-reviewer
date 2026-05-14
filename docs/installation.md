# Installation

```bash
npm install -g codex-cc-reviewer
codex-cc-reviewer install
codex-cc-reviewer doctor
```

To validate an npm `next` prerelease in Codex before stable promotion:

```bash
npx --prefer-online -y codex-cc-reviewer@next --version
npx --prefer-online -y codex-cc-reviewer@next install --package-spec codex-cc-reviewer@next
npx --prefer-online -y codex-cc-reviewer@next doctor
```

Restart Codex after writing the prerelease MCP config. `doctor` should show `codex_cc_reviewer is configured (codex-cc-reviewer@next)`.

Requirements:

- Node.js 20 or newer
- npm
- Claude Code CLI authenticated locally
- Codex with MCP support

