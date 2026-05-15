import { buildReviewPacket } from "../review/packet.js";
import { CcReviewInputSchema, type CcReviewInput } from "../review/schema.js";

export interface LocalPreviewOptions {
  task?: string;
  reviewProfile?: string;
  context?: string;
  prompt?: string;
  originalGoal?: string;
  reviewFocus?: string;
  codexSummary?: string;
  acceptanceCriteria?: string | string[];
  knownRisks?: string | string[];
  testsRun?: string | string[];
  model?: string;
  effort?: string;
  output?: string;
  permissionMode?: string;
  tools?: string;
  cwd?: string;
  includeGitDiff?: boolean;
  includeGitStatus?: boolean;
  autoDiscoverGit?: boolean;
  includeUntrackedContent?: boolean;
  redactSecrets?: boolean;
  maxContextChars?: number | string;
  cacheTtl?: string;
}

export interface LocalPreviewDeps {
  buildPacket?: (input: CcReviewInput) => Promise<string>;
  write?: (text: string) => void;
}

export async function runLocalPreview(
  options: LocalPreviewOptions,
  deps: LocalPreviewDeps = {}
): Promise<string> {
  const input = CcReviewInputSchema.parse(normalizePreviewOptions(options));
  const makePacket = deps.buildPacket ?? buildReviewPacket;
  const write = deps.write ?? ((text: string) => process.stdout.write(text));
  const packet = await makePacket(input);

  write(packet);

  return packet;
}

function normalizePreviewOptions(options: LocalPreviewOptions): Record<string, unknown> {
  const normalized: Record<string, unknown> = { ...options };

  if (typeof options.maxContextChars === "string") {
    normalized.maxContextChars = Number(options.maxContextChars);
  }

  return normalized;
}
