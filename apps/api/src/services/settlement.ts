// Settlement decision — server-side eligibility, Observator V1.
// Spec §28: the server MUST independently confirm eligibility.
// The browser/client NEVER decides settlement; any client-supplied
// "verified:true" is ignored (no such field is even read).
// Chain submission (signature) wires in at Checkpoint B; until then the
// decision is recorded as PENDING — retryable and idempotent per spec §24.
import type { Db } from "../db.js";

export type SettlementAction = "release" | "refund";

export interface SettlementEligibility {
  eligible: boolean;
  action?: SettlementAction;
  reason?: string;
}

export function decideSettlement(
  db: Db,
  jobId: string,
  nowMs: number = Date.now(),
): SettlementEligibility {
  const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(jobId) as
    | { id: string; status: string; deadline: string }
    | undefined;
  if (!job) return { eligible: false, reason: "job_not_found" };

  const existing = db
    .prepare("SELECT * FROM settlements WHERE job_id = ?")
    .get(jobId) as { action: SettlementAction; status: string } | undefined;
  if (existing && existing.status !== "FAILED") {
    // Idempotent: a recorded decision is returned, never duplicated.
    return { eligible: true, action: existing.action };
  }

  const run = db
    .prepare("SELECT * FROM verification_runs WHERE job_id = ? ORDER BY id DESC LIMIT 1")
    .get(jobId) as { status: string } | undefined;

  const expired = nowMs > Date.parse(job.deadline);
  if (run && run.status === "PASS" && !expired) return { eligible: true, action: "release" };
  // Timeout refund: an expired job refunds even if it was never verified.
  if (expired) return { eligible: true, action: "refund" };
  // Failed conditions refund immediately (spec §3).
  if (run) return { eligible: true, action: "refund" };
  return { eligible: false, reason: "not_verified" };
}
