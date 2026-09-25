// Job lifecycle routes — Observator V1 backend orchestration.
// Spec §§14, 28. Flow: POST /api/jobs → delivery → verify → settle.
// Settlement eligibility is decided server-side (services/settlement);
// chain signatures attach at Checkpoint B (Playground deploy).
import { randomBytes, createHash } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Db } from "../db.js";
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

export function registerJobRoutes(app: FastifyInstance, db: Db) {
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
    db.exec("BEGIN");
    try {
      db.prepare(
        `INSERT INTO jobs (id, buyer_address, provider_url, provider_address,
         escrow_address, amount, mint, status, deadline, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'CREATED', ?, ?, ?)`,
      ).run(
        jobId, body.buyerAddress, body.providerUrl, body.providerAddress,
        escrowAddress, body.amount, body.mint, body.deadline, now, now,
      );
      const stmt = db.prepare(
        "INSERT INTO conditions (job_id, type, config_json, required) VALUES (?, ?, ?, 1)",
      );
      for (const c of body.conditions) stmt.run(jobId, c.type, JSON.stringify(c));
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
    return reply.code(201).send({ jobId, escrowAddress, status: "CREATED" });
  });

  // List jobs (dashboard explorer-lite).
  app.get("/api/jobs", async () => {
    const rows = db
      .prepare("SELECT * FROM jobs ORDER BY created_at DESC LIMIT 100")
      .all() as Record<string, unknown>[];
    return { jobs: rows.map(rowToJob) };
  });

  // Job detail with conditions, deliveries, runs, settlement.
  app.get("/api/jobs/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as
      | Record<string, unknown>
      | undefined;
    if (!job) return reply.code(404).send({ error: "job_not_found" });
    const conditions = db.prepare("SELECT * FROM conditions WHERE job_id = ?").all(id);
    const deliveries = db.prepare("SELECT * FROM deliveries WHERE job_id = ? ORDER BY id").all(id);
    const runs = db.prepare("SELECT * FROM verification_runs WHERE job_id = ? ORDER BY id").all(id);
    const settlement = db.prepare("SELECT * FROM settlements WHERE job_id = ?").get(id) ?? null;
    return { job: rowToJob(job), conditions, deliveries, verificationRuns: runs, settlement };
  });

  // Submit delivery — spec §28.
  app.post("/api/jobs/:id/delivery", async (req, reply) => {
    const { id } = req.params as { id: string };
    const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as
      | { status: string }
      | undefined;
    if (!job) return reply.code(404).send({ error: "job_not_found" });
    if (!["CREATED", "DELIVERED", "FAILED"].includes(job.status)) {
      return reply.code(409).send({ error: "delivery_not_allowed", status: job.status });
    }
    const parsed = DeliveryBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_delivery", details: parsed.error.flatten() });
    }
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO deliveries (job_id, evidence_url, submitted_at, metadata_json) VALUES (?, ?, ?, ?)",
    ).run(id, parsed.data.evidenceUrl, now, JSON.stringify(parsed.data.metadata));
    db.prepare("UPDATE jobs SET status = 'DELIVERED', updated_at = ? WHERE id = ?").run(now, id);
    return reply.code(201).send({ jobId: id, status: "DELIVERED" });
  });

  // Verify — runs the deterministic engine server-side, stores the run.
  app.post("/api/jobs/:id/verify", async (req, reply) => {
    const { id } = req.params as { id: string };
    const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as
      | { status: string; deadline: string }
      | undefined;
    if (!job) return reply.code(404).send({ error: "job_not_found" });
    const finalized = db.prepare("SELECT id FROM settlements WHERE job_id = ?").get(id);
    if (finalized) return reply.code(409).send({ error: "settlement_final" });
    const delivery = db
      .prepare("SELECT * FROM deliveries WHERE job_id = ? ORDER BY id DESC LIMIT 1")
      .get(id) as { evidence_url: string } | undefined;
    if (!delivery) return reply.code(400).send({ error: "no_delivery" });
    const condRows = db.prepare("SELECT config_json FROM conditions WHERE job_id = ?").all(id) as {
      config_json: string;
    }[];
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
    db.prepare(
      "INSERT INTO verification_runs (job_id, status, results_json, started_at, completed_at) VALUES (?, ?, ?, ?, ?)",
    ).run(id, report.overall, JSON.stringify(report), startedAt, completedAt);
    db.prepare("UPDATE jobs SET status = ?, updated_at = ? WHERE id = ?").run(
      report.overall === "PASS" ? "PASSED" : "FAILED",
      completedAt,
      id,
    );
    return { jobId: id, status: report.overall, checks: report.checks };
  });

  // Settle — server decides; client input (beyond job id) is not consulted.
  app.post("/api/jobs/:id/settle", async (req, reply) => {
    const { id } = req.params as { id: string };
    const decision = decideSettlement(db, id);
    if (!decision.eligible || !decision.action) {
      return reply.code(409).send({ error: decision.reason ?? "not_eligible" });
    }
    const existing = db.prepare("SELECT * FROM settlements WHERE job_id = ?").get(id) as
      | Record<string, unknown>
      | undefined;
    if (existing) {
      return {
        jobId: id,
        ...(existing as Record<string, unknown>),
        note: "chain submission attaches the signature at Checkpoint B",
      };
    }
    const now = new Date().toISOString();
    const job = db.prepare("SELECT deadline FROM jobs WHERE id = ?").get(id) as {
      deadline: string;
    };
    const expired = Date.now() > Date.parse(job.deadline);
    db.prepare(
      "INSERT INTO settlements (job_id, action, signature, status, created_at) VALUES (?, ?, NULL, 'PENDING', ?)",
    ).run(id, decision.action, now);
    db.prepare("UPDATE jobs SET status = ?, updated_at = ? WHERE id = ?").run(
      decision.action === "refund" && expired ? "EXPIRED" : "SETTLEMENT_PENDING",
      now,
      id,
    );
    const row = db.prepare("SELECT * FROM settlements WHERE job_id = ?").get(id);
    return {
      jobId: id,
      ...(row as Record<string, unknown>),
      note: "chain submission attaches the signature at Checkpoint B",
    };
  });
}
