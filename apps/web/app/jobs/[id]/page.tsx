"use client";
// Job Detail + Verification Report — spec §16 §§3-4.
// Shows amount, parties, escrow, state, deadline, conditions, deliveries,
// every check with evidence, and settlement. Actions drive the same API
// the E2E demo uses; the browser never decides settlement.
import { useCallback, useEffect, useState } from "react";
import { api, formatUsdc, type JobDetail, type Check } from "@/lib/api";

function CheckRow({ check }: { check: Check }) {
  const pass = check.status === "PASS";
  const evidence = Object.entries(check)
    .filter(([k]) => k !== "type" && k !== "status")
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join(" · ");
  return (
    <li className="flex gap-2 font-mono text-sm">
      <span className={pass ? "text-emerald-400" : "text-red-400"}>{pass ? "✓" : "✗"}</span>
      <span>
        <span className="font-semibold">{check.type}</span>
        {evidence && <span className="text-zinc-500"> — {evidence}</span>}
      </span>
    </li>
  );
}

export default function JobPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const d = await api.getJob(id);
      setDetail(d);
      if (!evidenceUrl && d.deliveries.length === 0) setEvidenceUrl(d.job.providerUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    refresh();
    const t = setInterval(() => {
      setDetail((d) =>
        d && ["CREATED", "DELIVERED"].includes(d.job.status) ? d : d,
      );
      refresh();
    }, 4000);
    return () => clearInterval(t);
  }, [refresh]);

  async function act(kind: "deliver" | "verify" | "settle") {
    setBusy(kind);
    setError(null);
    try {
      if (kind === "deliver") await api.deliver(id, evidenceUrl);
      if (kind === "verify") await api.verify(id);
      if (kind === "settle") await api.settle(id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    }
    setBusy(null);
  }

  if (error && !detail) return <p className="text-sm text-red-400">{error}</p>;
  if (!detail) return <p className="text-sm text-zinc-500">Loading…</p>;
  const { job, conditions, deliveries, verificationRuns, settlement } = detail;
  const latestRun = verificationRuns[verificationRuns.length - 1];
  const latestChecks: Check[] = latestRun ? JSON.parse(latestRun.results_json).checks : [];
  const terminal = ["SETTLEMENT_PENDING", "SETTLED", "EXPIRED"].includes(job.status);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-xl font-bold">{job.id}</h1>
        <span className="rounded border border-zinc-600 px-2 py-0.5 font-mono text-xs">
          {job.status}
        </span>
        <span className="ml-auto font-mono text-lg text-emerald-400">
          ${formatUsdc(job.amount)} USDC
        </span>
      </div>

      <section className="grid gap-3 rounded border border-zinc-800 bg-zinc-900 p-4 font-mono text-xs md:grid-cols-2">
        <p><span className="text-zinc-500">buyer </span>{job.buyerAddress}</p>
        <p><span className="text-zinc-500">provider </span>{job.providerAddress}</p>
        <p><span className="text-zinc-500">escrow </span>{job.escrowAddress ?? "pending program deploy (Checkpoint B)"}</p>
        <p><span className="text-zinc-500">deadline </span>{job.deadline}</p>
        <p className="md:col-span-2"><span className="text-zinc-500">endpoint </span>{job.providerUrl}</p>
      </section>

      <section className="rounded border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-zinc-400">Conditions</h2>
        <ul className="space-y-1 font-mono text-sm">
          {conditions.map((c, i) => (
            <li key={i}><span className="text-emerald-400">{c.type}</span>{" "}<span className="text-zinc-500">{c.config_json}</span></li>
          ))}
        </ul>
      </section>

      <section className="rounded border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-zinc-400">Delivery evidence</h2>
        {deliveries.length === 0 && <p className="text-sm text-zinc-500">No delivery submitted yet.</p>}
        <ul className="mb-3 space-y-1 font-mono text-xs text-zinc-400">
          {deliveries.map((d, i) => (
            <li key={i}>{d.evidence_url} <span className="text-zinc-600">· {d.submitted_at}</span></li>
          ))}
        </ul>
        {!terminal && (
          <div className="flex gap-2">
            <input value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)} placeholder="https://… evidence URL" spellCheck={false} className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm" />
            <button onClick={() => act("deliver")} disabled={busy !== null} className="shrink-0 rounded bg-blue-600 px-3 py-2 text-sm font-semibold hover:bg-blue-500 disabled:opacity-50">
              {busy === "deliver" ? "…" : "Deliver"}
            </button>
          </div>
        )}
      </section>

      <section className="rounded border border-zinc-800 bg-zinc-900 p-4">
        <div className="mb-2 flex items-center gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-400">Verification report</h2>
          {!terminal && (
            <button onClick={() => act("verify")} disabled={busy !== null || deliveries.length === 0} className="rounded bg-violet-600 px-3 py-1 text-sm font-semibold hover:bg-violet-500 disabled:opacity-50">
              {busy === "verify" ? "Verifying…" : "Run verification"}
            </button>
          )}
        </div>
        {latestChecks.length === 0 && <p className="text-sm text-zinc-500">Not verified yet.</p>}
        <ul className="space-y-1">
          {latestChecks.map((c, i) => (
            <CheckRow key={i} check={c} />
          ))}
        </ul>
        {latestRun && (
          <p className={`mt-3 font-mono text-sm font-bold ${latestRun.status === "PASS" ? "text-emerald-400" : "text-red-400"}`}>
            RESULT: {latestRun.status === "PASS" ? "PAYMENT RELEASED" : "PAYMENT REFUNDED"}
          </p>
        )}
      </section>

      <section className="rounded border border-zinc-800 bg-zinc-900 p-4">
        <div className="mb-2 flex items-center gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-400">Settlement</h2>
          {!terminal && (
            <button onClick={() => act("settle")} disabled={busy !== null} className="rounded bg-amber-600 px-3 py-1 text-sm font-semibold hover:bg-amber-500 disabled:opacity-50">
              {busy === "settle" ? "…" : "Settle"}
            </button>
          )}
        </div>
        {!settlement && <p className="text-sm text-zinc-500">Not settled.</p>}
        {settlement && (
          <div className="font-mono text-sm">
            <p>action: <span className={settlement.action === "release" ? "text-emerald-400" : "text-red-400"}>{settlement.action}</span></p>
            <p className="text-zinc-400">status: {settlement.status}{settlement.status === "PENDING" && " (chain signature attaches at Checkpoint B)"}</p>
            {settlement.signature ? (
              <a className="text-blue-400 underline" href={`https://explorer.solana.com/tx/${settlement.signature}?cluster=devnet`} target="_blank" rel="noreferrer">
                {settlement.signature}
              </a>
            ) : (
              <p className="text-zinc-500">signature: —</p>
            )}
          </div>
        )}
      </section>

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
