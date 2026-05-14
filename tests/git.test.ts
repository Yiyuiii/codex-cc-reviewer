import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { execa } from "execa";
import { describe, expect, it } from "vitest";

import { getGitDiff } from "../src/git/diff.js";
import { getGitSummary } from "../src/git/summary.js";
import { getGitStatus } from "../src/git/status.js";
import { getUntrackedFileEvidence, readUntrackedPath } from "../src/git/untracked.js";

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

  it("getGitSummary includes diff stat, name status, and untracked files", async () => {
    const cwd = await initRepo();

    try {
      await writeFile(path.join(cwd, "tracked.txt"), "new\n");
      await writeFile(path.join(cwd, "untracked.txt"), "new\n");

      const summary = await getGitSummary(cwd);

      expect(summary).toContain("Diff Stat");
      expect(summary).toContain("tracked.txt");
      expect(summary).toContain("Name Status");
      expect(summary).toContain("M");
      expect(summary).toContain("Untracked Files");
      expect(summary).toContain("untracked.txt");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("getGitSummary falls back before the first commit", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "codex-cc-reviewer-git-"));

    try {
      await execa("git", ["init"], { cwd });
      await writeFile(path.join(cwd, "new.txt"), "staged\n");
      await execa("git", ["add", "new.txt"], { cwd });

      const summary = await getGitSummary(cwd);

      expect(summary).toContain("Diff Stat");
      expect(summary).toContain("new.txt");
      expect(summary).toContain("Name Status");
      expect(summary).toContain("A");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("getUntrackedFileEvidence includes text candidates and omits low-signal files", async () => {
    const cwd = await initRepo();

    try {
      await writeFile(path.join(cwd, ".env"), "DATABASE_URL=postgres://user:pwd@localhost/app\n");
      await writeFile(path.join(cwd, "binary.dat"), Buffer.from([0x61, 0x00, 0x62]));
      await mkdir(path.join(cwd, "dist"));
      await writeFile(path.join(cwd, "dist", "app.js"), "console.log('built');\n");

      const evidence = await getUntrackedFileEvidence(cwd);

      expect(evidence).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ".env",
            inclusion: "candidate",
            reason: "untracked_text",
            content: "DATABASE_URL=postgres://user:pwd@localhost/app\n"
          }),
          expect.objectContaining({
            path: "binary.dat",
            inclusion: "omitted",
            reason: "null_byte_binary"
          }),
          expect.objectContaining({
            path: "dist/app.js",
            inclusion: "omitted",
            reason: "generated_or_lockfile"
          })
        ])
      );
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("getUntrackedFileEvidence caps the number of processed untracked paths", async () => {
    const cwd = await initRepo();

    try {
      for (let index = 0; index < 505; index += 1) {
        await writeFile(path.join(cwd, `file-${index}.txt`), `file ${index}\n`);
      }

      const evidence = await getUntrackedFileEvidence(cwd);

      expect(evidence).toHaveLength(505);
      expect(evidence.filter((file) => file.reason === "too_many_untracked")).toHaveLength(5);
      expect(evidence.filter((file) => file.inclusion === "candidate")).toHaveLength(500);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("getUntrackedFileEvidence prioritizes plausible text evidence before capping noisy paths", async () => {
    const cwd = await initRepo();

    try {
      await mkdir(path.join(cwd, "build"));
      await mkdir(path.join(cwd, "src"));
      for (let index = 0; index < 505; index += 1) {
        await writeFile(path.join(cwd, "build", `noise-${index}.txt`), `noise ${index}\n`);
      }
      await writeFile(path.join(cwd, "src", "important.ts"), "export const important = true;\n");

      const evidence = await getUntrackedFileEvidence(cwd);

      expect(evidence).toContainEqual(
        expect.objectContaining({
          path: "src/important.ts",
          inclusion: "candidate",
          reason: "untracked_text"
        })
      );
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("readUntrackedPath omits oversized files, symlinks, and repo-escape paths", async () => {
    const cwd = await initRepo();

    try {
      await writeFile(path.join(cwd, "large.txt"), "x".repeat(128_001));
      await writeFile(path.join(cwd, "target.txt"), "target\n");
      await symlink(path.join(cwd, "target.txt"), path.join(cwd, "link.txt"));

      await expect(readUntrackedPath(cwd, "../outside.txt")).resolves.toMatchObject({
        inclusion: "omitted",
        reason: "outside_repository"
      });
      await expect(readUntrackedPath(cwd, "large.txt")).resolves.toMatchObject({
        inclusion: "omitted",
        reason: "file_too_large"
      });
      await expect(readUntrackedPath(cwd, "link.txt")).resolves.toMatchObject({
        inclusion: "omitted",
        reason: "symlink"
      });
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
