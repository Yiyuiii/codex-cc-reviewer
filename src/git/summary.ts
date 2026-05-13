import { execa } from "execa";

export async function getGitSummary(cwd = process.cwd()): Promise<string> {
  const [headStat, headNameStatus, untracked] = await Promise.all([
    runGit(cwd, ["diff", "--no-ext-diff", "--stat", "HEAD"]),
    runGit(cwd, ["diff", "--no-ext-diff", "--name-status", "HEAD"]),
    runGit(cwd, ["ls-files", "--others", "--exclude-standard"])
  ]);

  const [stat, nameStatus] =
    headStat || headNameStatus
      ? [headStat, headNameStatus]
      : await getNoHeadDiffSummary(cwd);

  const sections = [
    stat ? section("Diff Stat", stat) : undefined,
    nameStatus ? section("Name Status", nameStatus) : undefined,
    untracked ? section("Untracked Files", untracked) : undefined
  ].filter(Boolean);

  return sections.join("\n\n").trim();
}

async function getNoHeadDiffSummary(cwd: string): Promise<[string, string]> {
  const [cachedStat, worktreeStat, cachedNameStatus, worktreeNameStatus] = await Promise.all([
    runGit(cwd, ["diff", "--no-ext-diff", "--stat", "--cached"]),
    runGit(cwd, ["diff", "--no-ext-diff", "--stat"]),
    runGit(cwd, ["diff", "--no-ext-diff", "--name-status", "--cached"]),
    runGit(cwd, ["diff", "--no-ext-diff", "--name-status"])
  ]);

  return [
    joinNonEmpty([cachedStat, worktreeStat]),
    joinNonEmpty([cachedNameStatus, worktreeNameStatus])
  ];
}

async function runGit(cwd: string, args: string[]): Promise<string> {
  const result = await execa("git", args, {
    cwd,
    reject: false
  });

  if (result.exitCode !== 0) {
    return "";
  }

  return result.stdout.trim();
}

function section(title: string, body: string): string {
  return `${title}\n${body}`;
}

function joinNonEmpty(values: string[]): string {
  return values.filter((value) => value.trim()).join("\n").trim();
}
