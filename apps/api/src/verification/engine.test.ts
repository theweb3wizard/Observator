// Verification engine unit tests — spec §30 (verification minimums).
// Run: npm run test --workspace apps/api
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { verifyDelivery, checkResolvedHost } from "./engine.js";

const NOW = Date.now();
const nowMs = () => NOW;
const futureDeadline = new Date(NOW + 120_000).toISOString();
const pastDeadline = new Date(NOW - 1_000).toISOString();

const GOOD = { symbol: "BTC", price: 112000, timestamp: Math.floor(NOW / 1000) };
const STALE = { symbol: "BTC", price: 112000, timestamp: Math.floor((NOW - 184_000) / 1000) };

type Handler = (req: IncomingMessage, res: ServerResponse) => void;
const servers: Server[] = [];

async function serve(handler: Handler): Promise<string> {
  const srv = createServer(handler);
  servers.push(srv);
  await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", resolve));
  const addr = srv.address();
  assert.ok(addr && typeof addr === "object");
  return `http://127.0.0.1:${addr.port}/data`;
}

const json = (res: ServerResponse, code: number, body: unknown, delayMs = 0) => {
  setTimeout(() => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(typeof body === "string" ? body : JSON.stringify(body));
  }, delayMs);
};

const BASE_CONDITIONS = [
  { type: "http_status", expected: 200 },
  { type: "required_fields", fields: ["symbol", "price", "timestamp"] },
  { type: "max_age_seconds", field: "timestamp", max: 60 },
];

const baseOpts = (evidenceUrl: string) => ({
  jobId: "job_test",
  evidenceUrl,
  conditions: BASE_CONDITIONS,
  deadlineIso: futureDeadline,
  allowPrivateHosts: true,
  nowMs,
});

after(() => {
  for (const s of servers) s.close();
});

describe("verification engine", () => {
  it("valid response passes", async () => {
    const url = await serve((_req, res) => json(res, 200, GOOD));
    const r = await verifyDelivery(baseOpts(url));
    assert.equal(r.overall, "PASS");
    assert.ok(r.checks.every((c) => c.status === "PASS"));
  });

  it("fresh timestamp passes, stale timestamp fails", async () => {
    const freshUrl = await serve((_req, res) => json(res, 200, GOOD));
    const staleUrl = await serve((_req, res) => json(res, 200, STALE));
    const fresh = await verifyDelivery(baseOpts(freshUrl));
    const stale = await verifyDelivery(baseOpts(staleUrl));
    const freshCheck = fresh.checks.find((c) => c.type === "freshness");
    const staleCheck = stale.checks.find((c) => c.type === "freshness");
    assert.equal(freshCheck?.status, "PASS");
    assert.equal(stale.overall, "FAIL");
    assert.equal(staleCheck?.status, "FAIL");
    assert.equal(staleCheck?.reason, "stale_timestamp");
  });

  it("malformed JSON fails", async () => {
    const url = await serve((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{not valid json");
    });
    const r = await verifyDelivery(baseOpts(url));
    assert.equal(r.overall, "FAIL");
    assert.equal(r.checks.find((c) => c.type === "json_valid")?.status, "FAIL");
  });

  it("missing field fails", async () => {
    const url = await serve((_req, res) => json(res, 200, { symbol: "BTC", price: 1 }));
    const r = await verifyDelivery(baseOpts(url));
    assert.equal(r.overall, "FAIL");
    const check = r.checks.find((c) => c.type === "required_fields");
    assert.equal(check?.status, "FAIL");
    assert.deepEqual(check?.missing, ["timestamp"]);
  });

  it("wrong HTTP status fails", async () => {
    const url = await serve((_req, res) => json(res, 500, GOOD));
    const r = await verifyDelivery(baseOpts(url));
    assert.equal(r.overall, "FAIL");
    const check = r.checks.find((c) => c.type === "http_status");
    assert.equal(check?.status, "FAIL");
    assert.equal(check?.actual, 500);
  });

  it("json_schema condition enforces shape", async () => {
    const schema = { type: "object", required: ["symbol", "price", "timestamp"] };
    const url = await serve((_req, res) => json(res, 200, GOOD));
    const pass = await verifyDelivery({
      ...baseOpts(url),
      conditions: [{ type: "json_schema", schema }],
    });
    assert.equal(pass.checks.find((c) => c.type === "json_schema")?.status, "PASS");
    const fail = await verifyDelivery({
      ...baseOpts(url),
      conditions: [{ type: "json_schema", schema: { ...schema, required: ["nope"] } }],
    });
    assert.equal(fail.overall, "FAIL");
  });

  it("timeout fails", async () => {
    const url = await serve((_req, res) => json(res, 200, GOOD, 600));
    const r = await verifyDelivery({ ...baseOpts(url), timeoutMs: 150 });
    assert.equal(r.overall, "FAIL");
    assert.equal(r.checks[0]?.type, "fetch");
    assert.equal(r.checks[0]?.status, "FAIL");
  });

  it("deadline failure works", async () => {
    const url = await serve((_req, res) => json(res, 200, GOOD));
    const r = await verifyDelivery({ ...baseOpts(url), deadlineIso: pastDeadline });
    assert.equal(r.overall, "FAIL");
    assert.equal(r.checks.find((c) => c.type === "deadline")?.status, "FAIL");
  });

  it("max_latency_ms enforced", async () => {
    const url = await serve((_req, res) => json(res, 200, GOOD, 250));
    const r = await verifyDelivery({
      ...baseOpts(url),
      conditions: [{ type: "max_latency_ms", max: 30 }],
    });
    assert.equal(r.overall, "FAIL");
    assert.equal(r.checks.find((c) => c.type === "max_latency_ms")?.status, "FAIL");
  });

  it("rejects invalid condition specs", async () => {
    const url = await serve((_req, res) => json(res, 200, GOOD));
    await assert.rejects(() =>
      verifyDelivery({ ...baseOpts(url), conditions: [{ type: "vibes", threshold: "high" }] }),
    );
  });

  it("blocks non-http and private URLs in production mode", async () => {
    const r1 = await verifyDelivery({ ...baseOpts("ftp://example.com/x"), nowMs });
    assert.equal(r1.checks[0]?.status, "FAIL");
    const url = await serve((_req, res) => json(res, 200, GOOD));
    const r2 = await verifyDelivery({ ...baseOpts(url), allowPrivateHosts: false, nowMs });
    assert.equal(r2.overall, "FAIL");
    assert.equal(r2.checks[0]?.type, "fetch");
  });

  it("oversized evidence fails closed", async () => {
    const url = await serve((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end("x".repeat(300 * 1024));
    });
    const r = await verifyDelivery(baseOpts(url));
    assert.equal(r.overall, "FAIL");
    assert.equal(r.checks[0]?.type, "fetch");
    assert.equal(r.checks[0]?.reason, "response_too_large");
  });

  it("malicious redirect targets are validated", async () => {
    const url = await serve((_req, res) => {
      res.writeHead(302, { location: "ftp://example.com/evil" });
      res.end();
    });
    const r = await verifyDelivery(baseOpts(url));
    assert.equal(r.overall, "FAIL");
    assert.equal(r.checks[0]?.type, "fetch");
  });

  it("public DNS hostnames are not mistaken for private IPs", () => {
    // Regression: isPrivateIp must only screen IP literals, never hostnames.
    checkResolvedHost("jsonplaceholder.typicode.com", ["172.64.155.211"]);
    checkResolvedHost("example.com", ["93.184.215.14", "2606:2800:220:1:248:1893:25c8:1946"]);
    assert.throws(() => checkResolvedHost("127.0.0.1", ["127.0.0.1"]), /url_resolves_to_private/);
    assert.throws(() => checkResolvedHost("10.0.0.5", ["10.0.0.5"]), /url_resolves_to_private/);
    assert.throws(() => checkResolvedHost("internal.example", ["192.168.1.10"]), /url_resolves_to_private/);
    assert.throws(() => checkResolvedHost("example.com", []), /url_resolves_to_private/);
  });
});
