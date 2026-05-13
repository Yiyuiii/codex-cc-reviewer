export type DiffFileStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "binary"
  | "unknown";

export interface ParsedDiffFile {
  path: string;
  oldPath?: string;
  status: DiffFileStatus;
  addedLines: number;
  deletedLines: number;
  binary: boolean;
  generated: boolean;
  raw: string;
}

export function parseUnifiedDiff(diff: string): ParsedDiffFile[] {
  const normalized = diff.replace(/\r\n/g, "\n").trimEnd();
  if (!normalized.trim()) {
    return [];
  }

  return splitDiffBlocks(normalized)
    .map(parseDiffBlock)
    .filter((file): file is ParsedDiffFile => file !== undefined);
}

function splitDiffBlocks(diff: string): string[] {
  const starts = [...diff.matchAll(/^diff --git /gm)].map((match) => match.index ?? 0);
  if (!starts.length) {
    return [];
  }

  return starts.map((start, index) => {
    const end = starts[index + 1] ?? diff.length;
    return diff.slice(start, end).trimEnd();
  });
}

function parseDiffBlock(raw: string): ParsedDiffFile | undefined {
  const header = /^diff --git a\/(.+) b\/(.+)$/m.exec(raw);
  if (!header) {
    return undefined;
  }

  const headerOldPath = header[1] ?? "";
  const headerNewPath = header[2] ?? "";
  const renameFrom = /^rename from (.+)$/m.exec(raw)?.[1];
  const renameTo = /^rename to (.+)$/m.exec(raw)?.[1];
  const copyFrom = /^copy from (.+)$/m.exec(raw)?.[1];
  const copyTo = /^copy to (.+)$/m.exec(raw)?.[1];
  const binary = /\bBinary files\b/.test(raw) || /\bGIT binary patch\b/.test(raw);
  const added = /^new file mode /m.test(raw);
  const deleted = /^deleted file mode /m.test(raw);
  const renamed = renameFrom !== undefined || renameTo !== undefined;
  const copied = copyFrom !== undefined || copyTo !== undefined;
  const path = renameTo ?? copyTo ?? (deleted ? headerOldPath : headerNewPath);
  const oldPath = renameFrom ?? copyFrom ?? (renamed || copied ? headerOldPath : undefined);
  const { addedLines, deletedLines } = countChangedLines(raw);

  return {
    path,
    oldPath,
    status: binary
      ? "binary"
      : added
        ? "added"
        : deleted
          ? "deleted"
          : renamed
            ? "renamed"
            : copied
              ? "copied"
              : "modified",
    addedLines,
    deletedLines,
    binary,
    generated: isGeneratedOrLockfilePath(path),
    raw
  };
}

function countChangedLines(raw: string): { addedLines: number; deletedLines: number } {
  let addedLines = 0;
  let deletedLines = 0;

  for (const line of raw.split("\n")) {
    if (isFileHeaderLine(line)) {
      continue;
    }

    if (line.startsWith("+")) {
      addedLines += 1;
    } else if (line.startsWith("-")) {
      deletedLines += 1;
    }
  }

  return { addedLines, deletedLines };
}

function isFileHeaderLine(line: string): boolean {
  return line === "+++" || line === "---" || line.startsWith("+++ ") || line.startsWith("--- ");
}

function isGeneratedOrLockfilePath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/").toLowerCase();
  const basename = normalized.split("/").at(-1) ?? normalized;

  if (
    basename === "package-lock.json" ||
    basename === "npm-shrinkwrap.json" ||
    basename === "pnpm-lock.yaml" ||
    basename === "yarn.lock" ||
    basename === "bun.lockb" ||
    basename.endsWith(".lock") ||
    /\.min\.[^/]+$/.test(basename)
  ) {
    return true;
  }

  return /(^|\/)(dist|build|coverage|\.next|node_modules)\//.test(normalized);
}
