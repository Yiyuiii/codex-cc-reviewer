import { describe, expect, it } from "vitest";

import {
  getConfiguredCodexReviewerPackageSpec,
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
    expect(getConfiguredCodexReviewerPackageSpec(once)).toBe("codex-cc-reviewer");
  });

  it("installs a custom npm package spec for prerelease validation", () => {
    const original = "model = \"gpt-5.3-codex\"\n";

    const installed = installCodexReviewerConfigText(original, {
      packageSpec: "codex-cc-reviewer@next"
    });

    expect(installed).toContain('args = ["-y", "codex-cc-reviewer@next", "serve"]');
    expect(getConfiguredCodexReviewerPackageSpec(installed)).toBe("codex-cc-reviewer@next");
  });

  it("replaces an existing reviewer block when the package spec changes", () => {
    const original = installCodexReviewerConfigText("model = \"gpt-5.3-codex\"\n");

    const replaced = installCodexReviewerConfigText(original, {
      packageSpec: "codex-cc-reviewer@next"
    });

    expect(countOccurrences(replaced, "[mcp_servers.codex_cc_reviewer]")).toBe(1);
    expect(replaced).not.toContain('args = ["-y", "codex-cc-reviewer", "serve"]');
    expect(replaced).toContain('args = ["-y", "codex-cc-reviewer@next", "serve"]');
  });

  it("roundtrips from default to custom package spec and back to default", () => {
    const original = "model = \"gpt-5.3-codex\"\n";
    const defaultInstall = installCodexReviewerConfigText(original);
    const customInstall = installCodexReviewerConfigText(defaultInstall, {
      packageSpec: "codex-cc-reviewer@next"
    });

    const backToDefault = installCodexReviewerConfigText(customInstall);

    expect(backToDefault).toBe(defaultInstall);
  });

  it.each(["", "   ", "@next", "other-package@next", "codex-cc-reviewer @next", "codex-cc-reviewer\"@next", "codex-cc-reviewer\\@next"])(
    "rejects invalid package spec %j",
    (packageSpec) => {
      expect(() => installCodexReviewerConfigText("", { packageSpec })).toThrow(
        /Invalid codex-cc-reviewer package spec/
      );
    }
  );

  it("returns undefined when no reviewer package spec is configured", () => {
    expect(getConfiguredCodexReviewerPackageSpec("model = \"gpt-5.3-codex\"\n")).toBeUndefined();
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
