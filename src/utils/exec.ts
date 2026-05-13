import { execa } from "execa";

export interface CommandCheck {
  ok: boolean;
  command: string;
  output: string;
}

export async function runCommandCheck(
  command: string,
  args: string[] = ["--version"]
): Promise<CommandCheck> {
  try {
    const result = await execa(command, args, {
      reject: false,
      timeout: 5_000
    });
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();

    return {
      ok: result.exitCode === 0,
      command: [command, ...args].join(" "),
      output: output || `exit ${result.exitCode}`
    };
  } catch (error) {
    return {
      ok: false,
      command: [command, ...args].join(" "),
      output: error instanceof Error ? error.message : String(error)
    };
  }
}

