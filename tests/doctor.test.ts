import { describe, expect, it } from "vitest";

import { shouldDoctorFail } from "../src/cli/doctor.js";
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
});
