import { execa } from "execa";

export async function getGitDiff(cwd = process.cwd()): Promise<string> {
  const result = await execa("git", ["diff", "--no-ext-diff"], {
    cwd,
    reject: false
  });

  if (result.exitCode !== 0) {
    return "";
  }

  return result.stdout.trim();
}

