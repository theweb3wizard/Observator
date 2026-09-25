// Settlement decision — server-side eligibility, Observator V1.
// Spec §28: the server MUST independently confirm eligibility.
// The browser/client NEVER decides settlement; any client-supplied
// "verified:true" is ignored (no such field is even read).
// Chain submission (signature) wires in at Checkpoint B; until then the
// decision is recorded as PENDING — retryable and idempotent per spec §24.
import type { Store } from "../db.js";

export type SettlementAction = "release" | "refund";

export interface SettlementEligibility {
  eligible: boolean;
  action?: SettlementAction;
  reason?: string;
}

export async function decideSettlement(
  store: Store,
  jobId: string,
  nowMs: number = Date.now(),
): Promise<SettlementEligibility> {
  const job = await store.get<{ id: string; status: string; deadline: string }>(
    "SELECT * FROM jobs WHERE id = ?",
    jobId,
  );
  if (!job) return { eligible: false, reason: "job_not_found" };

  const existing = await store.get<{ action: SettlementAction; status: string }>(
    "SELECT * FROM settlements WHERE job_id = ?",
    jobId,
  );
  if (existing && existing.status !== "FAILED") {
    // Idempotent: a recorded decision is returned, never duplicated.
    return { eligible: true, action: existing.action };
  }

  const run = await store.get<{ status: string }>(
    "SELECT * FROM verification_runs WHERE job_id = ? ORDER BY id DESC LIMIT 1",
    jobId,
  );

  const expired = nowMs > Date.parse(job.deadline);
  if (run && run.status === "PASS" && !expired) return { eligible: true, action: "release" };
  // Timeout refund: an expired job refunds even if it was never verified.
  if (expired) return { eligible: true, action: "refund" };
  // Failed conditions refund immediately (spec §3).
  if (run) return { eligible: true, action: "refund" };
  return { eligible: false, reason: "not_verified" };
}
