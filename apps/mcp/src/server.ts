// MCP server factory (side-effect free; index.ts connects stdio).
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TOOL_DEFS } from "./tools.js";

export function createMcpServer() {
  const server = new McpServer({ name: "observator", version: "0.1.0" });
  for (const tool of TOOL_DEFS) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.inputSchema },
      // SDK passes validated args; each tool builds a closure handler.
      (args: Record<string, unknown>) => tool.makeHandler(args)(),
    );
  }
  return server;
}
