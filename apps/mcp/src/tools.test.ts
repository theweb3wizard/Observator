// MCP protocol tests — spec §12 + Checkpoint F.
// Real MCP Client over InMemoryTransport drives all six tools against a
// live backend (api dist) and live evidence servers. No mocks.
// Run: npm run test --workspace apps/mcp
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildApp } from "../../api/dist/app.js";
import { createMcpServer } from "./server.js";

process.env.ALLOW_PRIVATE_HOSTS = "1";

const BUYER = "11111111111111111111111111111111";
const PROVIDER = "4zMMC9srt5Ri5X14GAgXhaHii3Gn9VQTzRpWhq1FUD9";
const NOW = Date.now();
const GOOD = { symbol: "BTC", price: 112000, timestamp: Math.floor(NOW / 1000) };
const STALE = { symbol: "BTC", price: 112000, timestamp: Math.floor((NOW - 184_000) / 1000) };
const CONDITIONS = [
  { type: "http_status", expected: 200 },
  { type: "required_fields", fields: ["symbol", "price", "timestamp"] },
  { type: "max_age_seconds", field: "timestamp", max: 60 },
];

const servers: Server[] = [];
async function serve(body: unknown): Promise<string> {
  const srv = createServer((_req: IncomingMessage, res: ServerResponse) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  });
  servers.push(srv);
  await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", resolve));
  const addr = srv.address();
  assert.ok(addr && typeof addr === "object");
  return `http://127.0.0.1:${addr.port}/data`;
}

function textOf(result: unknown): string {
  const r = result as { content: { type: string; text: string }[] };
  assert.equal(r.content[0]?.type, "text");
  return r.content[0].text;
}

describe("mcp agent interface", () => {
  let client: Client;
  let closeAll: () => Promise<void>;

  before(async () => {
    const { app } = await buildApp(":memory:");
    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address();
    assert.ok(addr && typeof addr === "object");
    process.env.OBSERVATOR_API_URL = `http://127.0.0.1:${addr.port}`;

    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "observator-test", version: "0.1.0" }, { capabilities: {} });
    const server = createMcpServer();
    await server.connect(serverT);
    await client.connect(clientT);
    closeAll = async () => {
      await client.close();
      await server.close();
      await app.close();
    };
  });

  after(async () => {
    await closeAll();
    for (const s of servers) s.close();
  });

  const createArgs = (evidenceUrl: string) => ({
    providerUrl: evidenceUrl,
    amount: "100000",
    asset: "USDC",
    deadlineSeconds: 300,
    conditions: CONDITIONS,
    buyerAddress: BUYER,
    providerAddress: PROVIDER,
  });

  it("exposes the six specified tools", async () => {
    const { tools } = await client.listTools();
    assert.deepEqual(
      tools.map((t) => t.name).sort(),
      [
        "create_conditional_job",
        "get_job",
        "get_verification_report",
        "settle_job",
        "submit_delivery",
        "verify_job",
      ].sort(),
    );
  });

  it("agent good path: create → deliver → verify → settle → report", async () => {
    const url = await serve(GOOD);
    const created = JSON.parse(
      textOf(await client.callTool({ name: "create_conditional_job", arguments: createArgs(url) })),
    );
    assert.match(created.jobId, /^job_/);

    await client.callTool({
      name: "submit_delivery",
      arguments: { jobId: created.jobId, evidenceUrl: url },
    });
    const verified = JSON.parse(
      textOf(await client.callTool({ name: "verify_job", arguments: { jobId: created.jobId } })),
    );
    assert.equal(verified.status, "PASS");

    const settled = JSON.parse(
      textOf(await client.callTool({ name: "settle_job", arguments: { jobId: created.jobId } })),
    );
    assert.equal(settled.action, "release");

    const report = JSON.parse(
      textOf(
        await client.callTool({ name: "get_verification_report", arguments: { jobId: created.jobId } }),
      ),
    );
    assert.match(report.human, /PAYMENT RELEASED/);
    assert.equal(report.machine.overall, "PASS");

    const job = JSON.parse(
      textOf(await client.callTool({ name: "get_job", arguments: { jobId: created.jobId } })),
    );
    assert.equal(job.job.status, "SETTLEMENT_PENDING");
  });

  it("agent bad path refunds, and early settle is rejected", async () => {
    const url = await serve(STALE);
    const created = JSON.parse(
      textOf(await client.callTool({ name: "create_conditional_job", arguments: createArgs(url) })),
    );
    const early = (await client.callTool({
      name: "settle_job",
      arguments: { jobId: created.jobId },
    })) as { isError?: boolean };
    assert.equal(early.isError, true);

    await client.callTool({
      name: "submit_delivery",
      arguments: { jobId: created.jobId, evidenceUrl: url },
    });
    const verified = JSON.parse(
      textOf(await client.callTool({ name: "verify_job", arguments: { jobId: created.jobId } })),
    );
    assert.equal(verified.status, "FAIL");
    const settled = JSON.parse(
      textOf(await client.callTool({ name: "settle_job", arguments: { jobId: created.jobId } })),
    );
    assert.equal(settled.action, "refund");
  });
});
