import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerCcReviewTool } from "./tools.js";

export async function serveMcp(): Promise<void> {
  const server = new McpServer({
    name: "codex-cc-reviewer",
    version: "0.2.0"
  });

  registerCcReviewTool(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

