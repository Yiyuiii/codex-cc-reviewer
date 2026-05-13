import { execa } from "execa";

export async function getGitStatus(cwd = process.cwd()): Promise<string> {
  const result = await execa("git", ["status", "--short"], {
    cwd,
    reject: false
  });

  if (result.exitCode !== 0) {
    return "";
  }

  return result.stdout.trim();
}

