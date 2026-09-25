// Backend workflow tests — Phase 4 + spec §30 integration minimums
// (chain steps assert PENDING decisions until Checkpoint B attaches signatures).
// Run: npm run test --workspace apps/api
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../app.js";

process.env.ALLOW_PRIVATE_HOSTS = "1";

const BUYER = "11111111111111111111111111111111";
const PROVIDER = "4zMMC9srt5Ri5X14GAgXhaHii3Gn9VQTzRpWhq1FUD9";
const MINT = "4zMMC9srt5Ri5X14GAgXhaHii3Gn9VQTzRpWhq1FUD9"; // Devnet USDC

const NOW = Date.now();
const GOOD = { symbol: "BTC", price: 112000, timestamp: Math.floor(NOW / 1000) };
const STALE = { symbol: "BTC", price: 112000, timestamp: Math.floor((NOW - 184_000) / 1000) };
const CONDITIONS = [
  { type: "http_status", expected: 200 },
  { type: "required_fields", fields: ["symbol", "price", "timestamp"] },
  { type: "max_age_seconds", field: "timestamp", max: 60 },
];

const servers: Server[] = [];
async function serve(body: unknown, code = 200): Promise<string> {
  const srv = createServer((_req: IncomingMessage, res: ServerResponse) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  });
  servers.push(srv);
  await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", resolve));
  const addr = srv.address();
  assert.ok(addr && typeof addr === "object");
  return `http://127.0.0.1:${addr.port}/data`;
}

function createPayload(evidenceIgnored?: string) {
  return {
    providerUrl: evidenceIgnored ?? "http://127.0.0.1:9/data",
    buyerAddress: BUYER,
    providerAddress: PROVIDER,
    amount: "100000",
    mint: MINT,
    deadline: new Date(Date.now() + 300_000).toISOString(),
    conditions: CONDITIONS,
  };
}

describe("backend workflow", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let store: Awaited<ReturnType<typeof buildApp>>["store"];
  before(async () => {
    ({ app, store } = await buildApp(":memory:"));
  });
  after(() => {
    for (const s of servers) s.close();
  });

  it("creates a job", async () => {
    const res = await app.inject({ method: "POST", url: "/api/jobs", payload: createPayload() });
    assert.equal(res.statusCode, 201);
    const body = res.json();
    assert.match(body.jobId, /^job_/);
    assert.equal(body.status, "CREATED");
  });

  it("rejects invalid conditions and past deadlines", async () => {
    const badCond = await app.inject({
      method: "POST",
      url: "/api/jobs",
      payload: { ...createPayload(), conditions: [{ type: "vibes" }] },
    });
    assert.equal(badCond.statusCode, 400);
    const pastDl = await app.inject({
      method: "POST",
      url: "/api/jobs",
      payload: { ...createPayload(), deadline: new Date(Date.now() - 1000).toISOString() },
    });
    assert.equal(pastDl.statusCode, 400);
    const badMint = await app.inject({
      method: "POST",
      url: "/api/jobs",
      payload: { ...createPayload(), mint: BUYER },
    });
    assert.equal(badMint.statusCode, 400);
  });

  it("full good path: create → deliver → verify PASS → settle release", async () => {
    const url = await serve(GOOD);
    const created = await app.inject({ method: "POST", url: "/api/jobs", payload: createPayload(url) });
    const { jobId } = created.json();

    const delivered = await app.inject({
      method: "POST",
      url: `/api/jobs/${jobId}/delivery`,
      payload: { evidenceUrl: url },
    });
    assert.equal(delivered.statusCode, 201);

    const verified = await app.inject({ method: "POST", url: `/api/jobs/${jobId}/verify` });
    assert.equal(verified.json().status, "PASS");

    const settled = await app.inject({ method: "POST", url: `/api/jobs/${jobId}/settle` });
    const s = settled.json();
    assert.equal(s.action, "release");
    assert.equal(s.status, "PENDING");
    assert.equal(s.signature, null);

    const detail = await app.inject({ method: "GET", url: `/api/jobs/${jobId}` });
    const d = detail.json();
    assert.equal(d.job.status, "SETTLEMENT_PENDING");
    assert.equal(d.verificationRuns.length, 1);
    assert.ok(d.settlement);
  });

  it("full bad path: stale delivery → FAIL → settle refund", async () => {
    const url = await serve(STALE);
    const created = await app.inject({ method: "POST", url: "/api/jobs", payload: createPayload(url) });
    const { jobId } = created.json();
    await app.inject({ method: "POST", url: `/api/jobs/${jobId}/delivery`, payload: { evidenceUrl: url } });
    const verified = await app.inject({ method: "POST", url: `/api/jobs/${jobId}/verify` });
    assert.equal(verified.json().status, "FAIL");
    const settled = await app.inject({ method: "POST", url: `/api/jobs/${jobId}/settle` });
    assert.equal(settled.json().action, "refund");
  });

  it("settle is idempotent; unsettled jobs are rejected", async () => {
    const url = await serve(GOOD);
    const created = await app.inject({ method: "POST", url: "/api/jobs", payload: createPayload(url) });
    const { jobId } = created.json();
    const early = await app.inject({ method: "POST", url: `/api/jobs/${jobId}/settle` });
    assert.equal(early.statusCode, 409);
    const noDelivery = await app.inject({ method: "POST", url: `/api/jobs/${jobId}/verify` });
    assert.equal(noDelivery.statusCode, 400);

    await app.inject({ method: "POST", url: `/api/jobs/${jobId}/delivery`, payload: { evidenceUrl: url } });
    await app.inject({ method: "POST", url: `/api/jobs/${jobId}/verify` });
    const s1 = await app.inject({ method: "POST", url: `/api/jobs/${jobId}/settle` });
    const s2 = await app.inject({ method: "POST", url: `/api/jobs/${jobId}/settle` });
    assert.deepEqual(s1.json(), s2.json());
    const count = await store.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM settlements WHERE job_id = ?",
      jobId,
    );
    assert.equal(count?.n, 1);
  });

  it("supports re-delivery retry after failure", async () => {
    const badUrl = await serve(STALE);
    const goodUrl = await serve(GOOD);
    const created = await app.inject({ method: "POST", url: "/api/jobs", payload: createPayload(badUrl) });
    const { jobId } = created.json();
    await app.inject({ method: "POST", url: `/api/jobs/${jobId}/delivery`, payload: { evidenceUrl: badUrl } });
    assert.equal((await app.inject({ method: "POST", url: `/api/jobs/${jobId}/verify` })).json().status, "FAIL");
    await app.inject({ method: "POST", url: `/api/jobs/${jobId}/delivery`, payload: { evidenceUrl: goodUrl } });
    assert.equal((await app.inject({ method: "POST", url: `/api/jobs/${jobId}/verify` })).json().status, "PASS");
  });

  it("ignores forged client verification claims", async () => {
    const url = await serve(GOOD);
    const created = await app.inject({ method: "POST", url: "/api/jobs", payload: createPayload(url) });
    const { jobId } = created.json();
    // Attacker claims verified:true — server decides from DB state only.
    const forged = await app.inject({
      method: "POST",
      url: `/api/jobs/${jobId}/settle`,
      payload: { verified: true },
    });
    assert.equal(forged.statusCode, 409);
    assert.equal(forged.json().error, "not_verified");
  });

  it("rejects unknown jobs and frozen post-settlement state", async () => {
    const missing = await app.inject({ method: "POST", url: "/api/jobs/job_nope/settle", payload: {} });
    assert.equal(missing.statusCode, 409);
    assert.equal(missing.json().error, "job_not_found");

    const url = await serve(GOOD);
    const created = await app.inject({ method: "POST", url: "/api/jobs", payload: createPayload(url) });
    const { jobId } = created.json();
    await app.inject({ method: "POST", url: `/api/jobs/${jobId}/delivery`, payload: { evidenceUrl: url } });
    await app.inject({ method: "POST", url: `/api/jobs/${jobId}/verify` });
    await app.inject({ method: "POST", url: `/api/jobs/${jobId}/settle` });

    const late = await app.inject({
      method: "POST",
      url: `/api/jobs/${jobId}/delivery`,
      payload: { evidenceUrl: url },
    });
    assert.equal(late.statusCode, 409);
    const reverify = await app.inject({ method: "POST", url: `/api/jobs/${jobId}/verify` });
    assert.equal(reverify.statusCode, 409);
    assert.equal(reverify.json().error, "settlement_final");

    // Amount cannot be manipulated: no update route exists.
    const patch = await app.inject({ method: "PATCH", url: `/api/jobs/${jobId}`, payload: { amount: "1" } });
    assert.equal(patch.statusCode, 404);
  });

  it("expired unverified jobs refund (timeout refund)", async () => {
    const url = await serve(GOOD);
    const created = await app.inject({ method: "POST", url: "/api/jobs", payload: createPayload(url) });
    const { jobId } = created.json();
    await store.run(
      "UPDATE jobs SET deadline = ? WHERE id = ?",
      new Date(Date.now() - 1000).toISOString(),
      jobId,
    );
    const settled = await app.inject({ method: "POST", url: `/api/jobs/${jobId}/settle`, payload: {} });
    assert.equal(settled.json().action, "refund");
    const detail = await app.inject({ method: "GET", url: `/api/jobs/${jobId}` });
    assert.equal(detail.json().job.status, "EXPIRED");
  });

  it("unreachable provider fails verification, not the server", async () => {
    const dead = "http://127.0.0.1:9/data";
    const created = await app.inject({ method: "POST", url: "/api/jobs", payload: createPayload(dead) });
    const { jobId } = created.json();
    await app.inject({ method: "POST", url: `/api/jobs/${jobId}/delivery`, payload: { evidenceUrl: dead } });
    const verified = await app.inject({ method: "POST", url: `/api/jobs/${jobId}/verify` });
    assert.equal(verified.statusCode, 200);
    assert.equal(verified.json().status, "FAIL");
  });

  it("corrupt condition rows fail closed", async () => {
    const url = await serve(GOOD);
    const created = await app.inject({ method: "POST", url: "/api/jobs", payload: createPayload(url) });
    const { jobId } = created.json();
    await app.inject({ method: "POST", url: `/api/jobs/${jobId}/delivery`, payload: { evidenceUrl: url } });
    await store.run("UPDATE conditions SET config_json = ? WHERE job_id = ?", '{"type":"vibes"}', jobId);
    const verified = await app.inject({ method: "POST", url: `/api/jobs/${jobId}/verify` });
    assert.equal(verified.statusCode, 500);
    assert.equal(verified.json().error, "verification_failed");
  });
});
