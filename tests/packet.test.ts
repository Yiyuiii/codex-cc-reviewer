import { describe, expect, it } from "vitest";

import { buildReviewPacket } from "../src/review/packet.js";
import type { CcReviewInput } from "../src/review/schema.js";

const baseInput: CcReviewInput = {
  task: "review_diff",
  context: "Please review the diff for correctness.",
  model: "sonnet",
  effort: "high",
  output: "markdown",
  permissionMode: "plan",
  tools: ["Read"],
  includeGitDiff: false,
  includeGitStatus: false,
  autoDiscoverGit: false,
  redactSecrets: true,
  maxContextChars: 120_000,
  stream: true,
  includePartialMessages: true,
  includeHookEvents: true,
  verbose: true,
  cacheTtl: "1h"
};

describe("buildReviewPacket", () => {
  it("wraps review input in stable packet sections", async () => {
    const packet = await buildReviewPacket({
      ...baseInput,
      prompt: "Focus on regression risk."
    });

    expect(packet).toContain("# Codex to Claude Code Review Packet");
    expect(packet).toContain("## Task Type\n\nreview_diff");
    expect(packet).toContain("## Review Focus\n\nFocus on regression risk.");
    expect(packet).not.toContain("## Codex Goal");
    expect(packet).toContain("## Current Context\n\nPlease review the diff for correctness.");
    expect(packet).toContain("## Review Instructions");
  });

  it("separates original goal, review focus, implementation notes, risks, and tests", async () => {
    const packet = await buildReviewPacket({
      ...baseInput,
      originalGoal: "Ship a safe installer.",
      reviewFocus: "Focus on install rollback.",
      codexSummary: "Changed the Codex config writer.",
      acceptanceCriteria: ["Install is idempotent.", "Uninstall removes only this server."],
      knownRisks: ["Windows TOML formatting."],
      testsRun: ["npm test: passed"]
    });

    expect(packet).toContain("## Original User Goal\n\nShip a safe installer.");
    expect(packet).toContain("## Acceptance Criteria\n\n- Install is idempotent.\n- Uninstall removes only this server.");
    expect(packet).toContain("## Codex Implementation Summary\n\nChanged the Codex config writer.");
    expect(packet).toContain("## Known Risks\n\n- Windows TOML formatting.");
    expect(packet).toContain("## Tests Run\n\n- npm test: passed");
    expect(packet).toContain("## Review Focus\n\nFocus on install rollback.");
  });

  it("puts stable review instructions before variable context for better cache reuse", async () => {
    const packet = await buildReviewPacket({
      ...baseInput,
      context: "volatile context"
    });

    expect(packet.indexOf("## Review Instructions")).toBeLessThan(
      packet.indexOf("## Current Context")
    );
  });

  it("injects git status and diff only when requested", async () => {
    const packet = await buildReviewPacket(
      {
        ...baseInput,
        includeGitStatus: true,
        includeGitDiff: true
      },
      {
        getGitSummary: async () => "Summary",
        getGitStatus: async () => "M src/index.ts",
        getGitDiff: async () => "diff --git a/src/index.ts b/src/index.ts"
      }
    );

    expect(packet).toContain("## Git Evidence Summary");
    expect(packet).toContain("Summary");
    expect(packet).toContain("## Optional Git Status");
    expect(packet).toContain("M src/index.ts");
    expect(packet).toContain("## Changed Files Manifest");
    expect(packet).toContain("## Routed Git Diff Evidence");
    expect(packet).toContain("diff --git a/src/index.ts b/src/index.ts");
  });

  it("routes git diff evidence through manifest, guidance, and per-file sections", async () => {
    const packet = await buildReviewPacket(
      {
        ...baseInput,
        includeGitDiff: true
      },
      {
        getGitSummary: async () => "Summary",
        getGitDiff: async () => [
          "diff --git a/src/foo.ts b/src/foo.ts",
          "index 1111111..2222222 100644",
          "--- a/src/foo.ts",
          "+++ b/src/foo.ts",
          "@@ -1 +1,2 @@",
          " const keep = true;",
          "+export const added = true;",
          "diff --git a/package-lock.json b/package-lock.json",
          "index 3333333..4444444 100644",
          "--- a/package-lock.json",
          "+++ b/package-lock.json",
          "@@ -1 +1 @@",
          "-old",
          "+new"
        ].join("\n")
      }
    );

    expect(packet).toContain("## Changed Files Manifest");
    expect(packet).toContain("| src/foo.ts | modified | full | +1/-0 | risk: source; source diff within budget |");
    expect(packet).toContain("| package-lock.json | modified | omitted | +1/-1 | risk: generated_or_lockfile; omitted |");
    expect(packet).toContain("## Context Routing Guidance");
    expect(packet).toContain("partial or omitted");
    expect(packet).toContain("## Routed Git Diff Evidence");
    expect(packet).toContain("### src/foo.ts");
    expect(packet).toContain("+export const added = true;");
    expect(packet).not.toContain("```diff\n-old\n+new");
  });

  it("embeds raw fallback evidence when a non-empty diff cannot be parsed", async () => {
    const packet = await buildReviewPacket(
      {
        ...baseInput,
        includeGitDiff: true,
        redactSecrets: false
      },
      {
        getGitSummary: async () => "Summary",
        getGitDiff: async () => [
          "mailbox-style diff without git headers",
          "+important fallback evidence"
        ].join("\n")
      }
    );

    expect(packet).toContain("## Changed Files Manifest");
    expect(packet).toContain("| [unparsed-diff] | unknown | full | n/a | risk: unparseable; diff_parse_failed; raw_fallback |");
    expect(packet).toContain("## Routed Git Diff Evidence");
    expect(packet).toContain("### [unparsed-diff]");
    expect(packet).toContain("Inclusion: full");
    expect(packet).toContain("Reason: risk: unparseable; diff_parse_failed; raw_fallback");
    expect(packet).toContain("+important fallback evidence");
    expect(packet).toContain("## Packet Diagnostics");
    expect(packet).toContain("git diff was non-empty but no files were parsed; embedded raw diff fallback evidence.");
  });

  it("embeds raw fallback evidence when malformed diff headers produce no parsed files", async () => {
    const packet = await buildReviewPacket(
      {
        ...baseInput,
        includeGitDiff: true,
        redactSecrets: false
      },
      {
        getGitSummary: async () => "Summary",
        getGitDiff: async () => [
          "diff --git foo bar",
          "index 1111111..2222222 100644",
          "-old",
          "+new"
        ].join("\n")
      }
    );

    expect(packet).toContain("| [unparsed-diff] | unknown | full | n/a | risk: unparseable; diff_parse_failed; raw_fallback |");
    expect(packet).toContain("diff --git foo bar");
    expect(packet).toContain("+new");
    expect(packet).toContain(
      "git diff was non-empty but no files were parsed; parser observed 1 diff --git block(s), all dropped; embedded raw diff fallback evidence."
    );
  });

  it("adds diagnostics when some diff blocks are dropped by parsing", async () => {
    const packet = await buildReviewPacket(
      {
        ...baseInput,
        includeGitDiff: true,
        redactSecrets: false
      },
      {
        getGitSummary: async () => "Summary",
        getGitDiff: async () => [
          "diff --git a/src/good.ts b/src/good.ts",
          "index 1111111..2222222 100644",
          "--- a/src/good.ts",
          "+++ b/src/good.ts",
          "@@ -1 +1 @@",
          "-old",
          "+new",
          "diff --git malformed header",
          "index 3333333..4444444 100644",
          "-hidden",
          "+hidden"
        ].join("\n")
      }
    );

    expect(packet).toContain("| src/good.ts | modified | full | +1/-1 | risk: source; source diff within budget |");
    expect(packet).not.toContain("raw_fallback");
    expect(packet).toContain("## Packet Diagnostics");
    expect(packet).toContain("git diff parser dropped 1 of 2 diff blocks; raw diff evidence may be incomplete.");
  });

  it("redacts raw fallback evidence before embedding it", async () => {
    const packet = await buildReviewPacket(
      {
        ...baseInput,
        includeGitDiff: true,
        redactSecrets: true
      },
      {
        getGitSummary: async () => "Summary",
        getGitDiff: async () => [
          "not a unified diff",
          "API_KEY=sk-test1234567890"
        ].join("\n")
      }
    );

    expect(packet).toContain("API_KEY=[REDACTED]");
    expect(packet).not.toContain("sk-test1234567890");
    expect(packet).toContain("git diff was non-empty but no files were parsed; embedded raw diff fallback evidence.");
  });

  it("does not trigger raw fallback for empty git diff evidence", async () => {
    const packet = await buildReviewPacket(
      {
        ...baseInput,
        includeGitDiff: true
      },
      {
        getGitSummary: async () => "Summary",
        getGitDiff: async () => ""
      }
    );

    expect(packet).toContain("## Changed Files Manifest");
    expect(packet).toContain("No changed files were parsed from the git diff.");
    expect(packet).not.toContain("[unparsed-diff]");
    expect(packet).not.toContain("raw_fallback");
    expect(packet).not.toContain("git diff was non-empty but no files were parsed");
  });

  it("auto-discovers git evidence for review_diff by default", async () => {
    const packet = await buildReviewPacket(
      {
        ...baseInput,
        autoDiscoverGit: undefined
      },
      {
        getGitSummary: async () => "Diff Stat\n src/index.ts | 2 +-\nName Status\nM\tsrc/index.ts",
        getGitStatus: async () => "1 .M N... 100644 100644 100644 abc abc src/index.ts",
        getGitDiff: async () => "diff --git a/src/index.ts b/src/index.ts",
        getUntrackedFileEvidence: async () => []
      }
    );

    expect(packet).toContain("## Git Evidence Summary");
    expect(packet).toContain("Name Status");
    expect(packet).toContain("## Optional Git Status");
    expect(packet).toContain("1 .M N...");
    expect(packet).toContain("## Changed Files Manifest");
    expect(packet).toContain("diff --git a/src/index.ts b/src/index.ts");
  });

  it("auto-discovers untracked text bodies for review_diff by default", async () => {
    const packet = await buildReviewPacket(
      {
        ...baseInput,
        autoDiscoverGit: undefined,
        redactSecrets: false
      },
      {
        getGitSummary: async () => "Untracked Files\n.env",
        getGitStatus: async () => "? .env",
        getGitDiff: async () => "",
        getUntrackedFileEvidence: async () => [
          {
            path: ".env",
            sizeBytes: 49,
            content: "DATABASE_URL=postgres://user:pwd@localhost/app\n",
            inclusion: "candidate",
            reason: "untracked_text"
          }
        ]
      }
    );

    expect(packet).toContain("## Untracked Files Manifest");
    expect(packet).toContain("| .env | full |");
    expect(packet).toContain("## Routed Untracked File Evidence");
    expect(packet).toContain("DATABASE_URL=postgres://user:pwd@localhost/app");
    expect(packet).not.toContain("review_diff requested git evidence");
  });

  it("auto-discovers untracked text bodies for adversarial_review by default", async () => {
    const packet = await buildReviewPacket(
      {
        ...baseInput,
        task: "adversarial_review",
        autoDiscoverGit: undefined,
        redactSecrets: false
      },
      {
        getGitSummary: async () => "Untracked Files\nsrc/new.ts",
        getGitStatus: async () => "? src/new.ts",
        getGitDiff: async () => "",
        getUntrackedFileEvidence: async () => [
          {
            path: "src/new.ts",
            sizeBytes: 19,
            content: "export const x = 1;\n",
            inclusion: "candidate",
            reason: "untracked_text"
          }
        ]
      }
    );

    expect(packet).toContain("## Routed Untracked File Evidence");
    expect(packet).toContain("export const x = 1;");
  });

  it("does not embed untracked bodies for review_plan or review_doc by default", async () => {
    const calls: string[] = [];

    for (const task of ["review_plan", "review_doc"] as const) {
      const packet = await buildReviewPacket(
        {
          ...baseInput,
          task,
          autoDiscoverGit: undefined,
          redactSecrets: false
        },
        {
          getGitSummary: async () => "Untracked Files\n.env",
          getGitStatus: async () => {
            calls.push(`${task}:status`);
            return "? .env";
          },
          getGitDiff: async () => {
            calls.push(`${task}:diff`);
            return "";
          },
          getUntrackedFileEvidence: async () => {
            calls.push(`${task}:untracked`);
            return [
              {
                path: ".env",
                sizeBytes: 49,
                content: "DATABASE_URL=postgres://user:pwd@localhost/app\n",
                inclusion: "candidate",
                reason: "untracked_text"
              }
            ];
          }
        }
      );

      expect(packet).toContain("## Git Evidence Summary");
      expect(packet).not.toContain("## Routed Untracked File Evidence");
      expect(packet).not.toContain("DATABASE_URL=postgres://user:pwd@localhost/app");
    }

    expect(calls).toEqual([]);
  });

  it("allows review_plan to embed untracked bodies when explicitly requested", async () => {
    const packet = await buildReviewPacket(
      {
        ...baseInput,
        task: "review_plan",
        autoDiscoverGit: undefined,
        includeUntrackedContent: true,
        redactSecrets: false
      },
      {
        getGitSummary: async () => "Untracked Files\nnotes.md",
        getGitStatus: async () => "",
        getGitDiff: async () => "",
        getUntrackedFileEvidence: async () => [
          {
            path: "notes.md",
            sizeBytes: 15,
            content: "planning note\n",
            inclusion: "candidate",
            reason: "untracked_text"
          }
        ]
      }
    );

    expect(packet).toContain("## Routed Untracked File Evidence");
    expect(packet).toContain("planning note");
  });

  it("disables default untracked body discovery when includeUntrackedContent is false", async () => {
    let untrackedCalls = 0;

    const packet = await buildReviewPacket(
      {
        ...baseInput,
        autoDiscoverGit: undefined,
        includeUntrackedContent: false
      },
      {
        getGitSummary: async () => "Untracked Files\n.env",
        getGitStatus: async () => "? .env",
        getGitDiff: async () => "",
        getUntrackedFileEvidence: async () => {
          untrackedCalls += 1;
          return [];
        }
      }
    );

    expect(untrackedCalls).toBe(0);
    expect(packet).not.toContain("## Routed Untracked File Evidence");
  });

  it("redacts .env-style untracked values before embedding when redactSecrets is true", async () => {
    const packet = await buildReviewPacket(
      {
        ...baseInput,
        autoDiscoverGit: undefined,
        redactSecrets: true
      },
      {
        getGitSummary: async () => "Untracked Files\n.env",
        getGitStatus: async () => "? .env",
        getGitDiff: async () => "",
        getUntrackedFileEvidence: async () => [
          {
            path: ".env",
            sizeBytes: 49,
            content: "DATABASE_URL=postgres://user:pwd@localhost/app\n",
            inclusion: "candidate",
            reason: "untracked_text"
          }
        ]
      }
    );

    expect(packet).toContain("DATABASE_URL=[REDACTED]");
    expect(packet).not.toContain("postgres://user:pwd@localhost/app");
    expect(packet).toContain("embedded with redactSecrets=true");
  });

  it("redacts private key blocks before embedding untracked files", async () => {
    const privateKey = [
      "-----BEGIN OPENSSH PRIVATE KEY-----",
      "b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAA",
      "-----END OPENSSH PRIVATE KEY-----"
    ].join("\n");
    const packet = await buildReviewPacket(
      {
        ...baseInput,
        autoDiscoverGit: undefined,
        redactSecrets: true
      },
      {
        getGitSummary: async () => "Untracked Files\nid_rsa",
        getGitStatus: async () => "? id_rsa",
        getGitDiff: async () => "",
        getUntrackedFileEvidence: async () => [
          {
            path: "id_rsa",
            sizeBytes: Buffer.byteLength(privateKey, "utf8"),
            content: privateKey,
            inclusion: "candidate",
            reason: "untracked_text"
          }
        ]
      }
    );

    expect(packet).toContain("[REDACTED PRIVATE KEY BLOCK]");
    expect(packet).not.toContain("b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAA");
  });

  it("does not shrink routed git diff output when no untracked files are embedded", async () => {
    const diff = [
      "diff --git a/src/foo.ts b/src/foo.ts",
      "index 1111111..2222222 100644",
      "--- a/src/foo.ts",
      "+++ b/src/foo.ts",
      "@@ -1 +1,2 @@",
      " const keep = true;",
      "+export const added = true;"
    ].join("\n");
    const deps = {
      getGitSummary: async () => "Summary",
      getGitStatus: async () => "M src/foo.ts",
      getGitDiff: async () => diff,
      getUntrackedFileEvidence: async () => []
    };

    const withoutUntracked = await buildReviewPacket(
      {
        ...baseInput,
        autoDiscoverGit: undefined,
        includeUntrackedContent: false
      },
      deps
    );
    const withEmptyUntracked = await buildReviewPacket(
      {
        ...baseInput,
        autoDiscoverGit: undefined,
        includeUntrackedContent: true
      },
      deps
    );

    expect(withEmptyUntracked).toContain("## Routed Git Diff Evidence");
    expect(withEmptyUntracked).not.toContain("## Routed Untracked File Evidence");
    expect(withEmptyUntracked).toBe(withoutUntracked);
  });

  it("auto-discovers lightweight git summary for review_plan by default", async () => {
    const called: string[] = [];

    const packet = await buildReviewPacket(
      {
        ...baseInput,
        task: "review_plan",
        autoDiscoverGit: undefined
      },
      {
        getGitSummary: async () => {
          called.push("summary");
          return "Diff Stat\n src/index.ts | 2 +-\nName Status\nM\tsrc/index.ts";
        },
        getGitStatus: async () => {
          called.push("status");
          return "status";
        },
        getGitDiff: async () => {
          called.push("diff");
          return "diff";
        }
      }
    );

    expect(called).toEqual(["summary"]);
    expect(packet).toContain("## Git Evidence Summary");
    expect(packet).toContain("Name Status");
    expect(packet).not.toContain("## Optional Git Status");
    expect(packet).not.toContain("## Changed Files Manifest");
  });

  it("auto-discovers raw git evidence for review_plan when explicitly requested", async () => {
    const called: string[] = [];

    const packet = await buildReviewPacket(
      {
        ...baseInput,
        task: "review_plan",
        autoDiscoverGit: true
      },
      {
        getGitSummary: async () => {
          called.push("summary");
          return "Diff Stat\n src/index.ts | 2 +-\nName Status\nM\tsrc/index.ts";
        },
        getGitStatus: async () => {
          called.push("status");
          return "1 .M N... 100644 100644 100644 abc abc src/index.ts";
        },
        getGitDiff: async () => {
          called.push("diff");
          return "diff --git a/src/index.ts b/src/index.ts";
        }
      }
    );

    expect(called).toEqual(["summary", "status", "diff"]);
    expect(packet).toContain("## Git Evidence Summary");
    expect(packet).toContain("## Optional Git Status");
    expect(packet).toContain("## Changed Files Manifest");
  });

  it("does not auto-discover git evidence when autoDiscoverGit is false", async () => {
    let gitCalls = 0;

    const packet = await buildReviewPacket(
      {
        ...baseInput,
        task: "review_plan",
        autoDiscoverGit: false
      },
      {
        getGitSummary: async () => {
          gitCalls += 1;
          return "summary";
        },
        getGitStatus: async () => {
          gitCalls += 1;
          return "status";
        },
        getGitDiff: async () => {
          gitCalls += 1;
          return "diff";
        }
      }
    );

    expect(gitCalls).toBe(0);
    expect(packet).not.toContain("## Git Evidence Summary");
    expect(packet).not.toContain("## Optional Git Status");
    expect(packet).not.toContain("## Changed Files Manifest");
  });

  it("prefers reviewFocus over the backward-compatible prompt alias", async () => {
    const packet = await buildReviewPacket({
      ...baseInput,
      prompt: "Legacy focus.",
      reviewFocus: "New focus."
    });

    expect(packet).toContain("## Review Focus\n\nNew focus.");
    expect(packet).not.toContain("Legacy focus.");
  });

  it("adds diagnostics when review_diff discovers no git evidence", async () => {
    const packet = await buildReviewPacket(
      {
        ...baseInput,
        autoDiscoverGit: undefined
      },
      {
        getGitSummary: async () => "",
        getGitStatus: async () => "",
        getGitDiff: async () => "",
        getUntrackedFileEvidence: async () => []
      }
    );

    expect(packet).toContain("## Packet Diagnostics");
    expect(packet).toContain("review_diff requested git evidence, but no git status or diff was provided or discovered.");
    expect(packet).not.toContain("## Optional Git Status");
    expect(packet).not.toContain("## Optional Git Diff");
  });

  it("redacts common secret-shaped values", async () => {
    const packet = await buildReviewPacket({
      ...baseInput,
      context: "The code uses API_KEY=sk-test1234567890 and password=\"open sesame\"."
    });

    expect(packet).not.toContain("sk-test1234567890");
    expect(packet).not.toContain("open sesame");
    expect(packet).toContain("[REDACTED]");
  });

  it("redacts common uppercase env-style secret variants", async () => {
    const packet = await buildReviewPacket({
      ...baseInput,
      context: [
        "URL=https://example.invalid/token",
        "API_KEYS=alpha,beta",
        "ACCESS_TOKENS=secret-token",
        "JWT=header.payload.signature",
        "BEARER=token-value",
        "AUTH=basic-value",
        "CONNECTION_STRING=postgres://user:pwd@localhost/app",
        "PRIVATE_KEY_PEM=-----BEGIN"
      ].join("\n")
    });

    expect(packet).not.toContain("https://example.invalid/token");
    expect(packet).not.toContain("alpha,beta");
    expect(packet).not.toContain("secret-token");
    expect(packet).not.toContain("header.payload.signature");
    expect(packet).not.toContain("token-value");
    expect(packet).not.toContain("basic-value");
    expect(packet).not.toContain("postgres://user:pwd@localhost/app");
    expect(packet).not.toContain("-----BEGIN");
    expect(packet.match(/\[REDACTED\]/g)?.length).toBeGreaterThanOrEqual(8);
  });

  it("limits oversized context and marks truncation", async () => {
    const packet = await buildReviewPacket({
      ...baseInput,
      context: "x".repeat(5_000),
      maxContextChars: 1_000
    });

    expect(packet.length).toBeLessThan(3_500);
    expect(packet).toContain("[TRUNCATED");
  });

  it("truncates oversized packet blocks from the middle and keeps both ends", async () => {
    const packet = await buildReviewPacket({
      ...baseInput,
      context: `HEAD-IMPORTANT\n${"a".repeat(700)}\nMIDDLE-SHOULD-BE-OMITTED\n${"b".repeat(700)}\nTAIL-IMPORTANT`,
      maxContextChars: 1_000
    });

    expect(packet).toContain("HEAD-IMPORTANT");
    expect(packet).toContain("TAIL-IMPORTANT");
    expect(packet).toContain("[TRUNCATED");
    expect(packet).toContain("from middle");
    expect(packet).not.toContain("MIDDLE-SHOULD-BE-OMITTED");
  });

  it("applies the context limit to variable packet blocks, not each block independently", async () => {
    const packet = await buildReviewPacket(
      {
        ...baseInput,
        prompt: "p".repeat(2_000),
        context: "c".repeat(2_000),
        includeGitStatus: true,
        includeGitDiff: true,
        maxContextChars: 1_500
      },
      {
        getGitSummary: async () => "g".repeat(2_000),
        getGitStatus: async () => "s".repeat(2_000),
        getGitDiff: async () => "d".repeat(2_000)
      }
    );

    expect(packet.length).toBeLessThan(4_500);
    expect(packet).toContain("[TRUNCATED");
  });
});
