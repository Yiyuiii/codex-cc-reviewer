import { describe, expect, it } from "vitest";

import {
  installCodexReviewerConfigText,
  uninstallCodexReviewerConfigText
} from "../src/config/codex.js";

describe("Codex config text mutation", () => {
  it("installs the MCP server block idempotently", () => {
    const original = "model = \"gpt-5.3-codex\"\n";

    const once = installCodexReviewerConfigText(original);
    const twice = installCodexReviewerConfigText(once);

    expect(twice).toBe(once);
    expect(countOccurrences(twice, "[mcp_servers.codex_cc_reviewer]")).toBe(1);
    expect(twice).toContain('command = "npx"');
    expect(twice).toContain('args = ["-y", "codex-cc-reviewer", "serve"]');
    expect(twice).toContain("required = false");
    expect(twice).toContain('enabled_tools = ["cc_review"]');
  });

  it("uninstalls only the reviewer block and preserves later tables", () => {
    const installed = installCodexReviewerConfigText(`[profiles.default]\nmodel = "gpt-5"\n`);
    const withLaterTable = `${installed}\n[profiles.work]\nmodel = "gpt-5.3-codex"\n`;

    const removed = uninstallCodexReviewerConfigText(withLaterTable);

    expect(removed).not.toContain("[mcp_servers.codex_cc_reviewer]");
    expect(removed).toContain("[profiles.default]");
    expect(removed).toContain("[profiles.work]");
  });
});

function countOccurrences(value: string, needle: string): number {
  return value.split(needle).length - 1;
}
