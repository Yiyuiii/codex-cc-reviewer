import { describe, expect, it } from "vitest";

import {
  backgroundJobsResult,
  claudeCliResult,
  daemonRosterResult,
  parseClaudeVersion,
  shouldDoctorFail
} from "../src/cli/doctor.js";
import type { DoctorResult } from "../src/cli/doctor.js";

describe("doctor result severity", () => {
  it("does not fail when the optional Codex CLI check is only a warning", () => {
    const results: DoctorResult[] = [
      { name: "Node", ok: true, level: "ok", detail: "v24.0.0" },
      { name: "npm", ok: true, level: "ok", detail: "11.0.0" },
      {
        name: "Codex CLI",
        ok: false,
        level: "warn",
        detail: "not runnable from PATH; Codex app MCP config may still work"
      },
      { name: "Claude Code CLI", ok: true, level: "ok", detail: "2.1.92" },
      { name: "Codex config", ok: true, level: "ok", detail: "config.toml" },
      { name: "MCP registration", ok: true, level: "ok", detail: "configured" }
    ];

    expect(shouldDoctorFail(results)).toBe(false);
  });

  it("fails when a required check fails", () => {
    const results: DoctorResult[] = [
      { name: "Claude Code CLI", ok: false, level: "error", detail: "not found" }
    ];

    expect(shouldDoctorFail(results)).toBe(true);
  });

  it("parses Claude Code versions and warns for versions below the validated floor", () => {
    expect(parseClaudeVersion("2.1.140 (Claude Code)")).toBe("2.1.140");
    expect(parseClaudeVersion("node warning 18.19.0\n2.1.140 (Claude Code)")).toBe("2.1.140");

    const result = claudeCliResult({
      ok: true,
      command: "claude --version",
      output: "2.1.91 (Claude Code)"
    });

    expect(result.level).toBe("warn");
    expect(result.detail).toContain("below validated version");
    expect(shouldDoctorFail([result])).toBe(false);
  });

  it("accepts supported Claude Code versions and warns when the version cannot be parsed", () => {
    const supported = claudeCliResult({
      ok: true,
      command: "claude --version",
      output: "2.1.140 (Claude Code)"
    });
    const unknown = claudeCliResult({
      ok: true,
      command: "claude --version",
      output: "Claude Code"
    });

    expect(supported.level).toBe("ok");
    expect(unknown.level).toBe("warn");
    expect(unknown.detail).toContain("could not parse version");
  });

  it("warns when daemon workers were started with another Claude Code version", () => {
    const result = daemonRosterResult(
      JSON.stringify({
        workers: {
          abc123: { cliVersion: "2.1.91" },
          def456: { cliVersion: "2.1.140" }
        }
      }),
      "2.1.140"
    );

    expect(result.level).toBe("warn");
    expect(result.detail).toContain("different Claude Code version");
    expect(shouldDoctorFail([result])).toBe(false);
  });

  it("warns about blocked background jobs without failing doctor", () => {
    const result = backgroundJobsResult([
      { name: "abc123", text: '{"state":"blocked"}' },
      { name: "working1", text: '{"state":"working"}' },
      { name: "def456", text: '{"state":"done"}' },
      { name: "badjson", text: '{"state":' }
    ]);

    expect(result.level).toBe("warn");
    expect(result.detail).toContain("blocked");
    expect(result.detail).toContain("abc123");
    expect(result.detail).toContain("could not be parsed");
    expect(shouldDoctorFail([result])).toBe(false);
  });

  it("keeps healthy daemon and background job states green", () => {
    expect(daemonRosterResult("").level).toBe("ok");
    expect(daemonRosterResult("not json").level).toBe("warn");
    expect(daemonRosterResult(JSON.stringify({})).level).toBe("ok");
    expect(
      daemonRosterResult(JSON.stringify({ workers: { abc123: { cliVersion: "2.1.140" } } }))
        .level
    ).toBe("ok");

    expect(backgroundJobsResult([]).level).toBe("ok");
    const working = backgroundJobsResult([{ name: "abc123", text: '{"state":"working"}' }]);
    expect(working.level).toBe("ok");
    expect(working.detail).toContain("working");
  });
});
