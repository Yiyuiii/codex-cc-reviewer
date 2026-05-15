import { describe, expect, it } from "vitest";

import { parseCacheUsage } from "../src/review/cache.js";

async function loadHarness(): Promise<Record<string, any>> {
  return import(new URL("../scripts/research-cache-repeat.mjs", import.meta.url).href);
}

describe("research-cache-repeat helpers", () => {
  it("parses benchmark options with defaults and overrides", async () => {
    const { parseArgs } = await loadHarness();

    expect(parseArgs([
      "--model", "opus",
      "--effort", "medium",
      "--tools", "default",
      "--runs", "3",
      "--stable-lines", "120",
      "--stable-location", "prompt",
      "--stable-tag", "abc123abc123",
      "--dynamic-mode", "same",
      "--timeout-ms", "5000",
      "--cache-ttl", "5m",
      "--exclude-dynamic-system-prompt-sections"
    ])).toMatchObject({
      model: "opus",
      effort: "medium",
      tools: "default",
      runs: 3,
      stableLines: 120,
      stableLocation: "prompt",
      stableTag: "abc123abc123",
      dynamicMode: "same",
      timeoutMs: 5000,
      cacheTtl: "5m",
      excludeDynamicSystemPromptSections: true
    });
  });

  it("rejects omitted option values instead of consuming the next flag", async () => {
    const { parseArgs } = await loadHarness();

    expect(() => parseArgs(["--model", "--runs", "2"])).toThrow("--model requires a value");
    expect(() => parseArgs(["--packet-file", ""])).toThrow("--packet-file requires a value");
  });

  it("allows an empty tools string for no-tool Claude Code runs", async () => {
    const { parseArgs } = await loadHarness();

    expect(parseArgs(["--tools", ""])).toMatchObject({ tools: "" });
  });

  it("rejects unstable tag values and packet-file tag combinations", async () => {
    const { parseArgs } = await loadHarness();

    expect(() => parseArgs(["--stable-tag", "short"])).toThrow(
      "--stable-tag must be at least 12 lowercase base36 characters"
    );
    expect(() => parseArgs(["--stable-tag", "ABC123ABC123"])).toThrow(
      "--stable-tag must be at least 12 lowercase base36 characters"
    );
    expect(() => parseArgs(["--stable-tag", "abc-123-abc-123"])).toThrow(
      "--stable-tag must be at least 12 lowercase base36 characters"
    );
    expect(() => parseArgs([
      "--stable-tag", "abc123abc123",
      "--packet-file", "packet.md"
    ])).toThrow("--stable-tag cannot be used with --packet-file");
    expect(() => parseArgs([
      "--stable-location", "append-system",
      "--packet-file", "packet.md"
    ])).toThrow("--stable-location append-system cannot be used with --packet-file");
  });

  it("caps append-system synthetic bodies before Windows argv limits", async () => {
    const { parseArgs } = await loadHarness();

    expect(parseArgs([
      "--stable-location", "append-system",
      "--stable-tag", "abc123abc123",
      "--stable-lines", "200"
    ])).toMatchObject({
      stableLocation: "append-system",
      stableLines: 200
    });
    expect(() => parseArgs([
      "--stable-location", "append-system",
      "--stable-tag", "abc123abc123",
      "--stable-lines", "300"
    ])).toThrow("--stable-location append-system generated");
  });

  it("preserves legacy synthetic text byte-for-byte when stable tag is omitted", async () => {
    const { buildRunSpec } = await loadHarness();
    const spec = buildRunSpec({
      model: "opus",
      effort: "low",
      tools: "default",
      cacheTtl: "1h",
      stableLocation: "stdin",
      dynamicMode: "same",
      stableLines: 2
    }, 0);

    expect(spec.stdin).toBe([
      "STATIC CACHE RESEARCH LINE 0000: Keep this line identical across calls.",
      "STATIC CACHE RESEARCH LINE 0001: Keep this line identical across calls.",
      "",
      "DYNAMIC_SUFFIX: same",
      "Return exactly: OK"
    ].join("\n"));
  });

  it("injects stable tags into synthetic lines without putting the stable tag in argv", async () => {
    const { buildRunSpec } = await loadHarness();
    const tag = "abc123abc123";
    const spec = buildRunSpec({
      model: "opus",
      effort: "low",
      tools: "default",
      cacheTtl: "1h",
      stableLocation: "stdin",
      stableTag: tag,
      dynamicMode: "same",
      stableLines: 2
    }, 0);

    expect(spec.stdin).toContain(`STATIC CACHE RESEARCH ${tag} LINE 0000`);
    expect(spec.stdin).toContain(`STATIC CACHE RESEARCH ${tag} LINE 0001`);
    expect(spec.args.join(" ")).not.toContain(tag);
  });

  it("places append-system stable text in argv while keeping dynamic suffix on stdin", async () => {
    const { buildRunSpec } = await loadHarness();
    const tag = "abc123abc123";
    const spec = buildRunSpec({
      model: "opus",
      effort: "low",
      tools: "default",
      cacheTtl: "1h",
      stableLocation: "append-system",
      stableTag: tag,
      dynamicMode: "same",
      stableLines: 2,
      excludeDynamicSystemPromptSections: true
    }, 0);
    const appendIndex = spec.args.indexOf("--append-system-prompt");

    expect(appendIndex).toBeGreaterThanOrEqual(0);
    expect(spec.args[appendIndex + 1]).toContain(`STATIC CACHE RESEARCH ${tag} LINE 0000`);
    expect(spec.args[appendIndex + 1]).toContain(`STATIC CACHE RESEARCH ${tag} LINE 0001`);
    expect(spec.args.filter((arg: string) => arg === "--append-system-prompt")).toHaveLength(1);
    expect(spec.args).toContain("--exclude-dynamic-system-prompt-sections");
    expect(spec.stdin).toBe([
      "DYNAMIC_SUFFIX: same",
      "Return exactly: OK"
    ].join("\n"));
    expect(spec.stdin).not.toContain("STATIC CACHE RESEARCH");
    expect(spec.args.join(" ")).not.toContain("DYNAMIC_SUFFIX");
  });

  it("makes same-mode synthetic stdin identical across run indexes", async () => {
    const { buildRunSpec } = await loadHarness();
    const options = {
      model: "opus",
      effort: "low",
      tools: "default",
      cacheTtl: "1h",
      stableLocation: "stdin",
      stableTag: "abc123abc123",
      dynamicMode: "same",
      stableLines: 2
    };

    expect(buildRunSpec(options, 0).stdin).toBe(buildRunSpec(options, 1).stdin);
  });

  it("summarizes append-system benchmark metadata without serializing appended bodies", async () => {
    const { buildBenchmarkOutput } = await loadHarness();
    const output = buildBenchmarkOutput({
      model: "opus",
      effort: "low",
      tools: "default",
      runs: 2,
      stableLines: 2,
      stableLocation: "append-system",
      stableTag: "abc123abc123",
      dynamicMode: "same",
      cacheTtl: "1h",
      excludeDynamicSystemPromptSections: true
    }, undefined, []);
    const serialized = JSON.stringify(output);

    expect(output).toMatchObject({
      stableLocation: "append-system",
      appendSystemPromptBytes: expect.any(Number),
      excludeDynamicSystemPromptSections: true
    });
    expect(serialized).not.toContain("STATIC CACHE RESEARCH");
  });

  it("builds Claude args and cache env without leaking packet content into argv", async () => {
    const { buildRunSpec } = await loadHarness();
    const sentinel = "SECRET_PACKET_SENTINEL";
    const oneHour = buildRunSpec({
      model: "opus",
      effort: "low",
      tools: "default",
      cacheTtl: "1h",
      stableLocation: "stdin",
      dynamicMode: "same",
      stableLines: 2,
      packetFile: "packet.md"
    }, 0, sentinel);
    const fiveMinute = buildRunSpec({
      model: "opus",
      effort: "low",
      tools: "default",
      cacheTtl: "5m",
      stableLocation: "stdin",
      dynamicMode: "same",
      stableLines: 2,
      packetFile: "packet.md"
    }, 0, sentinel);

    expect(oneHour.args).toContain("--no-session-persistence");
    expect(oneHour.args.join(" ")).not.toContain(sentinel);
    expect(oneHour.stdin).toContain(sentinel);
    expect(oneHour.stdin).not.toContain("Return exactly: OK");
    expect(oneHour.env.ENABLE_PROMPT_CACHING_1H).toBe("1");
    expect(fiveMinute.env.ENABLE_PROMPT_CACHING_1H).toBe("0");
  });

  it("keeps synthetic runs short while leaving packet-mode output unscripted", async () => {
    const { buildRunSpec } = await loadHarness();
    const synthetic = buildRunSpec({
      model: "opus",
      effort: "low",
      tools: "default",
      cacheTtl: "1h",
      stableLocation: "stdin",
      dynamicMode: "same",
      stableLines: 2
    }, 0);
    const packet = buildRunSpec({
      model: "opus",
      effort: "low",
      tools: "default",
      cacheTtl: "1h",
      stableLocation: "stdin",
      dynamicMode: "same",
      stableLines: 2,
      packetFile: "packet.md"
    }, 0, "PACKET");

    expect(synthetic.stdin).toContain("Return exactly: OK");
    expect(packet.stdin).not.toContain("Return exactly: OK");
  });

  it("summarizes runs without serializing prompt, stdin, packet, or stderr content", async () => {
    const { summarizeRun } = await loadHarness();
    const sentinel = "SECRET_PACKET_SENTINEL";
    const usage = {
      input_tokens: 3,
      cache_creation_input_tokens: 5,
      cache_read_input_tokens: 7,
      cache_creation: {
        ephemeral_1h_input_tokens: 5
      }
    };

    const summary = summarizeRun({
      label: "run-1",
      exitCode: 2,
      elapsedMs: 123,
      stdout: JSON.stringify({
        result: sentinel,
        total_cost_usd: 0.42,
        usage
      }),
      stderr: sentinel,
      prompt: sentinel,
      stdin: sentinel,
      packet: sentinel
    });

    expect(JSON.stringify(summary)).not.toContain(sentinel);
    expect(summary).toMatchObject({
      label: "run-1",
      exitCode: 2,
      elapsedMs: 123,
      stderrBytes: sentinel.length,
      usage: parseCacheUsage(usage),
      totalCostUsd: 0.42
    });
  });

  it("records spawn failures as run summaries", async () => {
    const { runClaude } = await loadHarness();

    const result = await runClaude({
      args: [],
      stdin: "",
      env: process.env
    }, 1000, "__codex_cc_reviewer_missing_claude__");

    expect(result.exitCode).toBeNull();
    expect(result.stderr).toContain("__codex_cc_reviewer_missing_claude__");
  });

  it("verifies Claude flag support only for requested experimental flags", async () => {
    const { verifyClaudeFlagSupport } = await loadHarness();

    await expect(verifyClaudeFlagSupport({
      stableLocation: "stdin",
      excludeDynamicSystemPromptSections: false
    }, "claude", async () => {
      throw new Error("help should not be read");
    })).resolves.toBeUndefined();
    await expect(verifyClaudeFlagSupport({
      stableLocation: "append-system",
      excludeDynamicSystemPromptSections: true
    }, "claude", async () => [
      "Usage: claude [--append-system-prompt <prompt>]",
      "--exclude-dynamic-system-prompt-sections"
    ].join("\n"))).resolves.toBeUndefined();
    await expect(verifyClaudeFlagSupport({
      stableLocation: "append-system",
      excludeDynamicSystemPromptSections: true
    }, "claude", async () => "--append-system-prompt <prompt>")).rejects.toThrow(
      "Claude help does not advertise required flag(s): --exclude-dynamic-system-prompt-sections"
    );
  });

  it("marks timed-out child processes without hanging the test", async () => {
    const { runClaude } = await loadHarness();

    const result = await runClaude({
      args: ["-e", "setTimeout(() => {}, 99999)"],
      stdin: "",
      env: process.env
    }, 100, process.execPath);

    expect(result.timedOut).toBe(true);
    expect(result.elapsedMs).toBeGreaterThanOrEqual(100);
  });

  it("can be imported without running the benchmark", async () => {
    const mod = await loadHarness();

    expect(mod).toHaveProperty("parseArgs");
    expect(mod).toHaveProperty("buildBenchmarkOutput");
    expect(mod).toHaveProperty("buildRunSpec");
    expect(mod).toHaveProperty("summarizeRun");
    expect(mod).toHaveProperty("runClaude");
    expect(mod).toHaveProperty("verifyClaudeFlagSupport");
  });
});
