// MCP tool definitions — spec §12. Single source of truth for condition
// shapes: imported from the backend's compiled contract (apps/api).
// Every tool delegates to the backend over HTTP; no settlement decision
// happens here — the backend (and ultimately the escrow program) decides.
import { z } from "zod";
import { ConditionSchema } from "../../api/dist/verification/conditions.js";
import { backend } from "./observator.js";

const DEVNET_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3Gn9VQTzRpWhq1FUD9";

type TextResult = { content: [{ type: "text"; text: string }]; isError?: boolean };

const ok = (value: unknown): TextResult => ({
  content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
});

const fail = (message: string): TextResult => ({
  content: [{ type: "text", text: JSON.stringify({ error: message }, null, 2) }],
  isError: true,
});

const run = (fn: () => Promise<unknown>) => async () => {
  try {
    return ok(await fn());
  } catch (err) {
    return fail(err instanceof Error ? err.message : "tool_failed");
  }
};

const createSchema = {
  providerUrl: z.string().url().describe("Provider endpoint delivering the service"),
  amount: z.string().regex(/^\d+$/, "base-unit integer string (e.g. 100000 = $0.10 USDC)"),
  asset: z.enum(["USDC"]).describe("V1 supports Devnet USDC only"),
  deadlineSeconds: z.number().int().positive().max(86400).describe("Seconds from now"),
  conditions: z.array(ConditionSchema).min(1).describe("Machine-verifiable acceptance criteria"),
  buyerAddress: z.string().min(1).describe("Buyer Solana address (funds source, refund destination)"),
  providerAddress: z.string().min(1).describe("Provider Solana address (release destination)"),
};

const jobIdSchema = { jobId: z.string().min(1) };

export const TOOL_DEFS: {
  name: string;
  description: string;
  inputSchema: Record<string, z.ZodTypeAny>;
  makeHandler: (args: Record<string, unknown>) => () => Promise<TextResult>;
}[] = [
  {
    name: "create_conditional_job",
    description:
      "Lock payment in Observator escrow under machine-verifiable conditions. Returns jobId, escrowAddress, and funding status.",
    inputSchema: createSchema,
    makeHandler: (a) =>
      run(async () => {
        const deadline = new Date(Date.now() + (a.deadlineSeconds as number) * 1000).toISOString();
        const created = await backend.createJob({
          providerUrl: a.providerUrl,
          buyerAddress: a.buyerAddress,
          providerAddress: a.providerAddress,
          amount: a.amount,
          mint: DEVNET_USDC_MINT,
          deadline,
          conditions: a.conditions,
        });
        return {
          ...created,
          fundingInstructions: created.escrowAddress
            ? `Fund escrow ${created.escrowAddress} with ${a.amount} Devnet USDC`
            : "Escrow address pending program deploy (Checkpoint B)",
        };
      }),
  },
  {
    name: "get_job",
    description: "Current job state: terms, status, deliveries, verification runs, settlement.",
    inputSchema: jobIdSchema,
    makeHandler: (a) => run(() => backend.getJob(a.jobId as string)),
  },
  {
    name: "submit_delivery",
    description: "Submit provider delivery evidence for a job.",
    inputSchema: {
      ...jobIdSchema,
      evidenceUrl: z.string().url(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    },
    makeHandler: (a) =>
      run(() =>
        backend.deliver(
          a.jobId as string,
          a.evidenceUrl as string,
          (a.metadata as Record<string, unknown>) ?? {},
        ),
      ),
  },
  {
    name: "verify_job",
    description: "Run deterministic verification against the latest delivery. Returns PASS/FAIL + checks.",
    inputSchema: jobIdSchema,
    makeHandler: (a) => run(() => backend.verify(a.jobId as string)),
  },
  {
    name: "settle_job",
    description:
      "Settle a verified job: release to provider on PASS, refund buyer on FAIL/expiry. Only valid after verification; otherwise rejected.",
    inputSchema: jobIdSchema,
    makeHandler: (a) => run(() => backend.settle(a.jobId as string)),
  },
  {
    name: "get_verification_report",
    description: "Human-readable and machine-readable verification evidence for a job.",
    inputSchema: jobIdSchema,
    makeHandler: (a) =>
      run(async () => {
        const detail = (await backend.getJob(a.jobId as string)) as {
          job: { id: string; status: string };
          verificationRuns: { status: string; results_json: string; completed_at: string }[];
          settlement: { action: string; status: string } | null;
        };
        const latest = detail.verificationRuns[detail.verificationRuns.length - 1];
        if (!latest) return { jobId: a.jobId, report: "Not verified yet." };
        const report = JSON.parse(latest.results_json) as {
          overall: string;
          checks: { type: string; status: string }[];
        };
        const lines = [
          `Verification report for ${a.jobId}`,
          `Overall: ${report.overall} (${report.checks.filter((c) => c.status === "PASS").length}/${report.checks.length} checks passed)`,
          ...report.checks.map((c) => `${c.status === "PASS" ? "✓" : "✗"} ${c.type}`),
          `RESULT: ${report.overall === "PASS" ? "PAYMENT RELEASED" : "PAYMENT REFUNDED"}`,
          detail.settlement
            ? `Settlement: ${detail.settlement.action} (${detail.settlement.status})`
            : "Settlement: pending",
        ];
        return { human: lines.join("\n"), machine: report };
      }),
  },
];
