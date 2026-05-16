import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

async function readWorkspaceFile(path: string): Promise<string> {
  return readFile(path, "utf8");
}

function sliceBetween(value: string, start: string, end: string): string {
  const startIndex = value.indexOf(start);
  const endIndex = value.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return value.slice(startIndex, endIndex);
}

function escapedRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

describe("release assurance configuration", () => {
  it("keeps package, CLI, and MCP server versions aligned", async () => {
    const packageJson = JSON.parse(await readWorkspaceFile("package.json")) as {
      version: string;
    };
    const packageLockJson = JSON.parse(await readWorkspaceFile("package-lock.json")) as {
      lockfileVersion: number;
      version: string;
      packages: { "": { version: string } };
    };
    const index = await readWorkspaceFile("src/index.ts");
    const server = await readWorkspaceFile("src/mcp/server.ts");
    const cliVersion = index.match(/\.name\("codex-cc-reviewer"\)[\s\S]*?\.version\("([^"]+)"\)/)?.[1];
    const mcpServerVersion = server.match(/new McpServer\(\{[^}]*version:\s*"([^"]+)"/)?.[1];
    const changelogHeading = new RegExp(`^## ${escapedRegExp(packageJson.version)}$`, "m");

    expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+(?:-[a-z0-9.]+)?$/);
    expect(packageLockJson.lockfileVersion).toBe(3);
    expect(packageLockJson.version).toBe(packageJson.version);
    expect(packageLockJson.packages[""].version).toBe(packageJson.version);
    expect(cliVersion).toBe(packageJson.version);
    expect(mcpServerVersion).toBe(packageJson.version);
    expect(await readWorkspaceFile("CHANGELOG.md")).toMatch(changelogHeading);
    expect(await readWorkspaceFile("CHANGELOG.zh-CN.md")).toMatch(changelogHeading);
  });

  it("exposes local preflight scripts with pack and CLI smoke checks", async () => {
    const packageJson = JSON.parse(await readWorkspaceFile("package.json")) as {
      scripts: Record<string, string>;
      files: string[];
    };

    expect(packageJson.scripts.preflight).toContain("npm ci");
    expect(packageJson.scripts.preflight).toContain("npm run verify:release");
    expect(packageJson.scripts["verify:release"]).toContain("npm run typecheck");
    expect(packageJson.scripts["verify:release"]).toContain("npm test");
    expect(packageJson.scripts["verify:release"]).toContain("npm run build");
    expect(packageJson.scripts["verify:release"]).toContain("npm pack --dry-run --json");
    expect(packageJson.scripts["verify:release"]).toContain("node dist/index.js --version");
    expect(packageJson.scripts["verify:release"]).toContain("node dist/index.js --help");
    expect(packageJson.scripts["research:bg-ab"]).toBe("node scripts/research-bg-ab.mjs");
    expect(packageJson.scripts["research:cache-repeat"]).toBe("node scripts/research-cache-repeat.mjs");
    expect(packageJson.files).toContain("scripts/research-bg-ab.mjs");
    expect(packageJson.files).toContain("scripts/research-cache-repeat.mjs");
  });

  it("keeps the maintainer bg research harness available to package scripts", async () => {
    const script = await readWorkspaceFile("scripts/research-bg-ab.mjs");

    expect(script).toContain("shell: false");
    expect(script).toContain("--bg");
    expect(script).toContain("research harness only");
  });

  it("exposes packet preview without importing the Claude runner", async () => {
    const index = await readWorkspaceFile("src/index.ts");
    const preview = await readWorkspaceFile("src/cli/preview.ts");

    expect(index).toContain('.command("preview")');
    expect(index).toContain("--include-untracked-content");
    expect(index).toContain("--no-include-untracked-content");
    expect(preview).toContain("buildReviewPacket");
    expect(preview).not.toContain("runClaudeReview");
    expect(preview).not.toContain("../runner/claude");
  });

  it("runs CI with cancellation, timeout, package smoke checks, and artifacts", async () => {
    const workflow = await readWorkspaceFile(".github/workflows/ci.yml");

    expect(workflow).toContain("concurrency:");
    expect(workflow).toContain("cancel-in-progress: true");
    expect(workflow).toContain("timeout-minutes: 15");
    expect(workflow).toContain("npm pack --dry-run --json > npm-pack-dry-run.json");
    expect(workflow).toContain("node dist/index.js --version");
    expect(workflow).toContain("node dist/index.js --help");
    expect(workflow).toContain("actions/upload-artifact");
    expect(workflow).toContain("retention-days: 7");
  });

  it("gates release publishing and creates GitHub Releases after publish", async () => {
    const workflow = await readWorkspaceFile(".github/workflows/release.yml");
    const onBlock = sliceBetween(workflow, "on:", "permissions:");

    expect(workflow).not.toContain("workflow_dispatch");
    expect(onBlock).toMatch(/on:\s+push:\s+tags:/s);
    expect(onBlock).not.toContain("branches:");
    expect(workflow).toContain("Verify package version matches tag");
    expect(workflow).toContain("Verify stable release validation evidence");
    expect(workflow).toContain("sed -i 's/\\r$//' \"$validation_file\"");
    expect(workflow).toContain(".release-validation/v${tag_version}.md");
    expect(workflow).toContain("Local-Codex-Smoke: pass");
    expect(workflow).toContain("npm pack --dry-run --json > npm-pack-dry-run.json");
    expect(workflow).toContain("Validate npm pack manifest");
    expect(workflow).toContain("node dist/index.js --help");
    expect(workflow).toContain("npm publish --ignore-scripts --provenance");
    expect(workflow).toContain("Verify published package");
    expect(workflow).toContain("npm view");
    expect(workflow).toContain("github-release:");
    expect(workflow).toContain("Create or update GitHub Release");
    expect(workflow).toContain('path.startsWith(".release-validation/")');

    const publishJob = sliceBetween(workflow, "  publish:", "  github-release:");
    const githubReleaseJob = workflow.slice(workflow.indexOf("  github-release:"));
    expect(publishJob).toContain("id-token: write");
    expect(publishJob).not.toContain("contents: write");
    expect(githubReleaseJob).toContain("contents: write");
  });

  it("normalizes release validation evidence files to LF", async () => {
    const attributes = await readWorkspaceFile(".gitattributes");

    expect(attributes).toContain(".release-validation/*.md text eol=lf");
  });
});
