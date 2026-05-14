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
      "--dynamic-mode", "same",
      "--timeout-ms", "5000",
      "--cache-ttl", "5m",
      "--packet-file", "packet.md"
    ])).toMatchObject({
      model: "opus",
      effort: "medium",
      tools: "default",
      runs: 3,
      stableLines: 120,
      stableLocation: "prompt",
      dynamicMode: "same",
      timeoutMs: 5000,
      cacheTtl: "5m",
      packetFile: "packet.md"
    });
  });

  it("rejects omitted option values instead of consuming the next flag", async () => {
    const { parseArgs } = await loadHarness();

    expect(() => parseArgs(["--model", "--runs", "2"])).toThrow("--model requires a value");
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
    expect(mod).toHaveProperty("buildRunSpec");
    expect(mod).toHaveProperty("summarizeRun");
    expect(mod).toHaveProperty("runClaude");
  });
});
