import { lstat, readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

import { execa } from "execa";

import { isGeneratedOrLockfilePath } from "../review/diff-parser.js";

const MAX_UNTRACKED_READ_BYTES = 128_000;
const BINARY_SAMPLE_BYTES = 8_000;
const MAX_UNTRACKED_PATHS = 500;
const UNTRACKED_READ_BATCH_SIZE = 32;

export type UntrackedFileInclusion = "candidate" | "omitted";

export interface UntrackedFileEvidence {
  path: string;
  sizeBytes?: number;
  content?: string;
  inclusion: UntrackedFileInclusion;
  reason: string;
}

export async function getUntrackedFileEvidence(cwd = process.cwd()): Promise<UntrackedFileEvidence[]> {
  const root = await getGitRoot(cwd);
  if (!root) {
    return [];
  }

  const paths = sortUntrackedPathsForReview(await getUntrackedPaths(root));
  const processablePaths = paths.slice(0, MAX_UNTRACKED_PATHS);
  const overflowPaths = paths.slice(MAX_UNTRACKED_PATHS);
  const evidence = await readUntrackedPathBatches(root, processablePaths);
  const overflowEvidence = overflowPaths.map((path): UntrackedFileEvidence => ({
    path: path.replace(/\\/g, "/"),
    inclusion: "omitted",
    reason: "too_many_untracked"
  }));
  return [...evidence, ...overflowEvidence];
}

async function readUntrackedPathBatches(
  root: string,
  paths: string[]
): Promise<UntrackedFileEvidence[]> {
  const evidence: UntrackedFileEvidence[] = [];

  for (let index = 0; index < paths.length; index += UNTRACKED_READ_BATCH_SIZE) {
    const batch = paths.slice(index, index + UNTRACKED_READ_BATCH_SIZE);
    evidence.push(...(await Promise.all(batch.map((path) => readUntrackedPath(root, path)))));
  }

  return evidence;
}

async function getGitRoot(cwd: string): Promise<string | undefined> {
  const result = await execa("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    reject: false
  });

  if (result.exitCode !== 0 || !result.stdout.trim()) {
    return undefined;
  }

  return resolve(result.stdout.trim());
}

async function getUntrackedPaths(cwd: string): Promise<string[]> {
  const result = await execa("git", ["ls-files", "--others", "--exclude-standard", "-z"], {
    cwd,
    reject: false
  });

  if (result.exitCode !== 0 || !result.stdout) {
    return [];
  }

  return result.stdout.split("\0").filter(Boolean);
}

export async function readUntrackedPath(root: string, repoRelativePath: string): Promise<UntrackedFileEvidence> {
  const normalizedPath = repoRelativePath.replace(/\\/g, "/");
  const absolutePath = resolve(root, normalizedPath);

  if (!isInsideRoot(root, absolutePath)) {
    return {
      path: normalizedPath,
      inclusion: "omitted",
      reason: "outside_repository"
    };
  }

  if (isGeneratedOrLockfilePath(normalizedPath)) {
    return {
      path: normalizedPath,
      inclusion: "omitted",
      reason: "generated_or_lockfile"
    };
  }

  if (isLikelyBinaryPath(normalizedPath)) {
    return {
      path: normalizedPath,
      inclusion: "omitted",
      reason: "binary_extension"
    };
  }

  try {
    const linkInfo = await lstat(absolutePath);
    if (linkInfo.isSymbolicLink()) {
      return {
        path: normalizedPath,
        inclusion: "omitted",
        reason: "symlink"
      };
    }

    if (!linkInfo.isFile()) {
      return {
        path: normalizedPath,
        inclusion: "omitted",
        reason: "not_regular_file"
      };
    }

    if (linkInfo.size > MAX_UNTRACKED_READ_BYTES) {
      return {
        path: normalizedPath,
        sizeBytes: linkInfo.size,
        inclusion: "omitted",
        reason: "file_too_large"
      };
    }

    // This runs in the trusted local-owner posture documented for the project.
    const buffer = await readFile(absolutePath);
    if (buffer.subarray(0, BINARY_SAMPLE_BYTES).includes(0)) {
      return {
        path: normalizedPath,
        sizeBytes: linkInfo.size,
        inclusion: "omitted",
        reason: "null_byte_binary"
      };
    }

    return {
      path: normalizedPath,
      sizeBytes: linkInfo.size,
      content: buffer.toString("utf8"),
      inclusion: "candidate",
      reason: "untracked_text"
    };
  } catch {
    return {
      path: normalizedPath,
      inclusion: "omitted",
      reason: "unreadable"
    };
  }
}

function sortUntrackedPathsForReview(paths: string[]): string[] {
  return paths
    .map((path, index) => ({
      path,
      index,
      rank: classifyUntrackedPathForCap(path)
    }))
    .sort((left, right) => {
      if (left.rank !== right.rank) {
        return left.rank - right.rank;
      }

      return left.index - right.index;
    })
    .map((entry) => entry.path);
}

function classifyUntrackedPathForCap(path: string): number {
  const normalizedPath = path.replace(/\\/g, "/").toLowerCase();

  if (isGeneratedOrLockfilePath(normalizedPath) || isLikelyBinaryPath(normalizedPath)) {
    return 6;
  }

  if (
    normalizedPath === ".env" ||
    normalizedPath.startsWith("src/") ||
    hasSecurityOrConfigToken(normalizedPath)
  ) {
    return 1;
  }

  if (normalizedPath.startsWith("tests/") || /\.(?:spec|test)\.[cm]?[jt]sx?$/.test(normalizedPath)) {
    return 3;
  }

  if (normalizedPath.startsWith("docs/") || normalizedPath.startsWith("examples/")) {
    return 4;
  }

  return 2;
}

function hasSecurityOrConfigToken(path: string): boolean {
  const tokens = path.split(/[\/._-]+/).filter(Boolean);
  return tokens.some((token) =>
    [
      "security",
      "auth",
      "permission",
      "permissions",
      "secret",
      "secrets",
      "token",
      "tokens",
      "credential",
      "credentials",
      "config",
      "env"
    ].includes(token)
  );
}

function isInsideRoot(root: string, child: string): boolean {
  const normalizedRoot = resolve(root);
  const normalizedChild = resolve(child);
  return normalizedChild === normalizedRoot || normalizedChild.startsWith(`${normalizedRoot}${sep}`);
}

function isLikelyBinaryPath(path: string): boolean {
  const basename = path.replace(/\\/g, "/").toLowerCase().split("/").at(-1) ?? path;
  return /\.(?:7z|avi|bin|bmp|class|dll|dmg|docx|exe|gif|gz|ico|jar|jpeg|jpg|mov|mp3|mp4|o|pdf|png|so|tar|tgz|wasm|webp|woff|woff2|zip)$/.test(basename);
}
