import { execa } from "execa";

export async function getGitDiff(cwd = process.cwd()): Promise<string> {
  const result = await execa("git", ["diff", "--no-ext-diff", "HEAD"], {
    cwd,
    reject: false
  });

  if (result.exitCode === 0) {
    return result.stdout.trim();
  }

  const [cached, worktree] = await Promise.all([
    execa("git", ["diff", "--no-ext-diff", "--cached"], {
      cwd,
      reject: false
    }),
    execa("git", ["diff", "--no-ext-diff"], {
      cwd,
      reject: false
    })
  ]);

  return [cached, worktree]
    .filter((item) => item.exitCode === 0 && item.stdout.trim())
    .map((item) => item.stdout.trim())
    .join("\n");
}
