// Observator MCP server entrypoint — stdio transport (spec §12).
// Configure in an MCP client with: node apps/mcp/dist/index.js
// and OBSERVATOR_API_URL pointing at the backend.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./server.js";

const server = createMcpServer();
await server.connect(new StdioServerTransport());
