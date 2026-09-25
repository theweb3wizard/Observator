// Job lifecycle routes — Observator V1 backend orchestration.
// Spec §§14, 28. Flow: POST /api/jobs → delivery → verify → settle.
// Settlement eligibility is decided server-side (services/settlement);
// chain signatures attach at Checkpoint B (Playground deploy).
// Storage goes through the Store interface (SQLite dev / Postgres prod).
import { randomBytes, createHash } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Store } from "../db.js";
import { ConditionSchema } from "../verification/conditions.js";
import { verifyDelivery } from "../verification/engine.js";
import { decideSettlement } from "../services/settlement.js";

const SolanaAddress = z
  .string()
  .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "invalid Solana address")
  .refine(
    (s) => {
      try {
        new PublicKey(s);
        return true;
      } catch {
        return false;
      }
    },
    "invalid Solana public key",
  );

const CreateJobBody = z.object({
  providerUrl: z.string().url().max(2048),
  buyerAddress: SolanaAddress,
  providerAddress: SolanaAddress,
  amount: z
    .string()
    .regex(/^\d+$/, "amount must be base-unit integer string")
    .refine((s) => BigInt(s) > 0n, "amount must be positive"),
  mint: SolanaAddress,
  deadline: z
    .string()
    .datetime()
    .refine((s) => Date.parse(s) > Date.now(), "deadline must be in the future"),
  conditions: ConditionSchema.array().min(1).max(16),
});

const DeliveryBody = z.object({
  evidenceUrl: z.string().url().max(2048),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

const DEVNET_USDC = "4zMMC9srt5Ri5X14GAgXhaHii3Gn9VQTzRpWhq1FUD9";

function deriveEscrowAddress(jobId: string): string | null {
  const programId = process.env.NEXT_PUBLIC_PROGRAM_ID;
  if (!programId) return null;
  try {
    const seed = createHash("sha256").update(jobId).digest();
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), seed],
      new PublicKey(programId),
    );
    return pda.toBase58();
  } catch {
    return null;
  }
}

function rowToJob(row: Record<string, unknown>) {
  return {
    id: row.id,
    buyerAddress: row.buyer_address,
    providerUrl: row.provider_url,
    providerAddress: row.provider_address,
    escrowAddress: row.escrow_address,
    amount: row.amount,
    mint: row.mint,
    status: row.status,
    deadline: row.deadline,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function registerJobRoutes(app: FastifyInstance, store: Store) {
  // Create job — spec §28.
  app.post("/api/jobs", async (req, reply) => {
    const parsed = CreateJobBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_job", details: parsed.error.flatten() });
    }
    const body = parsed.data;
    if (body.mint !== (process.env.NEXT_PUBLIC_USDC_MINT ?? DEVNET_USDC)) {
      // V1 targets Devnet USDC; any other mint is rejected explicitly.
      return reply.code(400).send({ error: "unsupported_mint" });
    }
    const jobId = `job_${randomBytes(16).toString("hex")}`;
    const now = new Date().toISOString();
    const escrowAddress = deriveEscrowAddress(jobId);
    await store.begin();
    try {
      await store.run(
        `INSERT INTO jobs (id, buyer_address, provider_url, provider_address,
         escrow_address, amount, mint, status, deadline, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'CREATED', ?, ?, ?)`,
        jobId, body.buyerAddress, body.providerUrl, body.providerAddress,
        escrowAddress, body.amount, body.mint, body.deadline, now, now,
      );
      for (const c of body.conditions) {
        await store.run(
          "INSERT INTO conditions (job_id, type, config_json, required) VALUES (?, ?, ?, 1)",
          jobId, c.type, JSON.stringify(c),
        );
      }
      await store.commit();
    } catch (err) {
      await store.rollback();
      throw err;
    }
    return reply.code(201).send({ jobId, escrowAddress, status: "CREATED" });
  });

  // List jobs (dashboard explorer-lite).
  app.get("/api/jobs", async () => {
    const rows = await store.all<Record<string, unknown>>(
      "SELECT * FROM jobs ORDER BY created_at DESC LIMIT 100",
    );
    return { jobs: rows.map(rowToJob) };
  });

  // Job detail with conditions, deliveries, runs, settlement.
  app.get("/api/jobs/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const job = await store.get<Record<string, unknown>>("SELECT * FROM jobs WHERE id = ?", id);
    if (!job) return reply.code(404).send({ error: "job_not_found" });
    const conditions = await store.all("SELECT * FROM conditions WHERE job_id = ?", id);
    const deliveries = await store.all("SELECT * FROM deliveries WHERE job_id = ? ORDER BY id", id);
    const runs = await store.all("SELECT * FROM verification_runs WHERE job_id = ? ORDER BY id", id);
    const settlement = (await store.get("SELECT * FROM settlements WHERE job_id = ?", id)) ?? null;
    return { job: rowToJob(job), conditions, deliveries, verificationRuns: runs, settlement };
  });

  // Submit delivery — spec §28.
  app.post("/api/jobs/:id/delivery", async (req, reply) => {
    const { id } = req.params as { id: string };
    const job = await store.get<{ status: string }>("SELECT * FROM jobs WHERE id = ?", id);
    if (!job) return reply.code(404).send({ error: "job_not_found" });
    if (!["CREATED", "DELIVERED", "FAILED"].includes(job.status)) {
      return reply.code(409).send({ error: "delivery_not_allowed", status: job.status });
    }
    const parsed = DeliveryBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_delivery", details: parsed.error.flatten() });
    }
    const now = new Date().toISOString();
    await store.run(
      "INSERT INTO deliveries (job_id, evidence_url, submitted_at, metadata_json) VALUES (?, ?, ?, ?)",
      id, parsed.data.evidenceUrl, now, JSON.stringify(parsed.data.metadata),
    );
    await store.run("UPDATE jobs SET status = 'DELIVERED', updated_at = ? WHERE id = ?", now, id);
    return reply.code(201).send({ jobId: id, status: "DELIVERED" });
  });

  // Verify — runs the deterministic engine server-side, stores the run.
  app.post("/api/jobs/:id/verify", async (req, reply) => {
    const { id } = req.params as { id: string };
    const job = await store.get<{ status: string; deadline: string }>(
      "SELECT * FROM jobs WHERE id = ?",
      id,
    );
    if (!job) return reply.code(404).send({ error: "job_not_found" });
    const finalized = await store.get("SELECT id FROM settlements WHERE job_id = ?", id);
    if (finalized) return reply.code(409).send({ error: "settlement_final" });
    const delivery = await store.get<{ evidence_url: string }>(
      "SELECT * FROM deliveries WHERE job_id = ? ORDER BY id DESC LIMIT 1",
      id,
    );
    if (!delivery) return reply.code(400).send({ error: "no_delivery" });
    const condRows = await store.all<{ config_json: string }>(
      "SELECT config_json FROM conditions WHERE job_id = ?",
      id,
    );
    const startedAt = new Date().toISOString();
    let report;
    try {
      report = await verifyDelivery({
        jobId: id,
        evidenceUrl: delivery.evidence_url,
        conditions: condRows.map((r) => JSON.parse(r.config_json)),
        deadlineIso: job.deadline,
        allowPrivateHosts: process.env.ALLOW_PRIVATE_HOSTS === "1",
      });
    } catch {
      // Corrupt job config or engine failure: fail closed, never settle.
      return reply.code(500).send({ error: "verification_failed" });
    }
    const completedAt = new Date().toISOString();
    await store.run(
      "INSERT INTO verification_runs (job_id, status, results_json, started_at, completed_at) VALUES (?, ?, ?, ?, ?)",
      id, report.overall, JSON.stringify(report), startedAt, completedAt,
    );
    await store.run("UPDATE jobs SET status = ?, updated_at = ? WHERE id = ?", 
      report.overall === "PASS" ? "PASSED" : "FAILED",
      completedAt,
      id,
    );
    return { jobId: id, status: report.overall, checks: report.checks };
  });

  // Settle — server decides; client input (beyond job id) is not consulted.
  app.post("/api/jobs/:id/settle", async (req, reply) => {
    const { id } = req.params as { id: string };
    const decision = await decideSettlement(store, id);
    if (!decision.eligible || !decision.action) {
      return reply.code(409).send({ error: decision.reason ?? "not_eligible" });
    }
    const existing = await store.get<Record<string, unknown>>(
      "SELECT * FROM settlements WHERE job_id = ?",
      id,
    );
    if (existing) {
      return {
        jobId: id,
        ...existing,
        note: "chain submission attaches the signature at Checkpoint B",
      };
    }
    const now = new Date().toISOString();
    const job = await store.get<{ deadline: string }>("SELECT deadline FROM jobs WHERE id = ?", id) as {
      deadline: string;
    };
    const expired = Date.now() > Date.parse(job.deadline);
    await store.run(
      "INSERT INTO settlements (job_id, action, signature, status, created_at) VALUES (?, ?, NULL, 'PENDING', ?)",
      id, decision.action, now,
    );
    await store.run("UPDATE jobs SET status = ?, updated_at = ? WHERE id = ?", 
      decision.action === "refund" && expired ? "EXPIRED" : "SETTLEMENT_PENDING",
      now,
      id,
    );
    const row = await store.get("SELECT * FROM settlements WHERE job_id = ?", id);
    return {
      jobId: id,
      ...(row as Record<string, unknown>),
      note: "chain submission attaches the signature at Checkpoint B",
    };
  });
}
