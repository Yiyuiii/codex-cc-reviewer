import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { execa } from "execa";
import { describe, expect, it } from "vitest";

import { getGitDiff } from "../src/git/diff.js";
import { getGitStatus } from "../src/git/status.js";

async function initRepo(): Promise<string> {
  const cwd = await mkdtemp(path.join(tmpdir(), "codex-cc-reviewer-git-"));
  await execa("git", ["init"], { cwd });
  await execa("git", ["config", "user.email", "test@example.com"], { cwd });
  await execa("git", ["config", "user.name", "Test User"], { cwd });
  await writeFile(path.join(cwd, "tracked.txt"), "old\n");
  await execa("git", ["add", "tracked.txt"], { cwd });
  await execa("git", ["commit", "-m", "initial"], { cwd });
  return cwd;
}

describe("git helpers", () => {
  it("getGitDiff includes staged changes against HEAD", async () => {
    const cwd = await initRepo();

    try {
      await writeFile(path.join(cwd, "tracked.txt"), "new\n");
      await execa("git", ["add", "tracked.txt"], { cwd });

      const diff = await getGitDiff(cwd);

      expect(diff).toContain("diff --git a/tracked.txt b/tracked.txt");
      expect(diff).toContain("+new");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("getGitDiff falls back when HEAD does not exist yet", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "codex-cc-reviewer-git-"));

    try {
      await execa("git", ["init"], { cwd });
      await writeFile(path.join(cwd, "new.txt"), "staged\n");
      await execa("git", ["add", "new.txt"], { cwd });
      await writeFile(path.join(cwd, "new.txt"), "changed\n");

      const diff = await getGitDiff(cwd);

      expect(diff).toContain("diff --git a/new.txt b/new.txt");
      expect(diff).toContain("+staged");
      expect(diff).toContain("+changed");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("getGitStatus uses porcelain v2 output", async () => {
    const cwd = await initRepo();

    try {
      await writeFile(path.join(cwd, "tracked.txt"), "new\n");

      const status = await getGitStatus(cwd);

      expect(status).toContain("1 .M");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
