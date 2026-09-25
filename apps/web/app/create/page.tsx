"use client";
// Create Job — spec §16: endpoint, amount, deadline, conditions, buyer wallet.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, DEVNET_USDC_MINT, DEMO_PROVIDER } from "@/lib/api";
import WalletButton from "@/components/WalletButton";

export default function CreateJob() {
  const router = useRouter();
  const [buyer, setBuyer] = useState("");
  const [providerUrl, setProviderUrl] = useState(`${DEMO_PROVIDER}/good`);
  const [providerAddress, setProviderAddress] = useState(
    "4zMMC9srt5Ri5X14GAgXhaHii3Gn9VQTzRpWhq1FUD9",
  );
  const [amountUsd, setAmountUsd] = useState("0.10");
  const [deadlineMin, setDeadlineMin] = useState("5");
  const [freshnessSec, setFreshnessSec] = useState("60");
  const [withSchema, setWithSchema] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const amount = String(Math.round(Number(amountUsd) * 1_000_000));
      if (!Number.isFinite(Number(amountUsd)) || BigInt(amount) <= 0n) {
        throw new Error("Amount must be a positive USD value.");
      }
      const conditions: Record<string, unknown>[] = [
        { type: "http_status", expected: 200 },
        { type: "required_fields", fields: ["symbol", "price", "timestamp"] },
      ];
      if (withSchema) {
        conditions.push({
          type: "json_schema",
          schema: { type: "object", required: ["symbol", "price", "timestamp"] },
        });
      }
      conditions.push({ type: "max_age_seconds", field: "timestamp", max: Number(freshnessSec) });
      const deadline = new Date(Date.now() + Number(deadlineMin) * 60_000).toISOString();
      const res = await api.createJob({
        providerUrl,
        buyerAddress: buyer,
        providerAddress,
        amount,
        mint: DEVNET_USDC_MINT,
        deadline,
        conditions,
      });
      router.push(`/jobs/${res.jobId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Creation failed.");
      setBusy(false);
    }
  }

  const input =
    "w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-mono";
  const label = "mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-400";

  return (
    <form onSubmit={submit} className="max-w-2xl space-y-5">
      <h1 className="text-2xl font-bold">Create conditional job</h1>

      <div>
        <label className={label}>Buyer wallet</label>
        <WalletButton address={buyer} onAddress={setBuyer} />
      </div>

      <div>
        <label className={label}>Provider endpoint</label>
        <input value={providerUrl} onChange={(e) => setProviderUrl(e.target.value)} className={input} />
        <div className="mt-2 flex gap-2 text-xs">
          <button type="button" onClick={() => setProviderUrl(`${DEMO_PROVIDER}/good`)} className="rounded border border-emerald-800 px-2 py-1 text-emerald-400 hover:border-emerald-500">
            Use /good (fresh)
          </button>
          <button type="button" onClick={() => setProviderUrl(`${DEMO_PROVIDER}/bad`)} className="rounded border border-red-800 px-2 py-1 text-red-400 hover:border-red-500">
            Use /bad (stale)
          </button>
        </div>
      </div>

      <div>
        <label className={label}>Provider wallet (receives payment on PASS)</label>
        <input value={providerAddress} onChange={(e) => setProviderAddress(e.target.value.trim())} className={input} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={label}>Amount (USDC)</label>
          <input value={amountUsd} onChange={(e) => setAmountUsd(e.target.value)} className={input} />
        </div>
        <div>
          <label className={label}>Deadline (min)</label>
          <input value={deadlineMin} onChange={(e) => setDeadlineMin(e.target.value)} className={input} />
        </div>
        <div>
          <label className={label}>Freshness (sec)</label>
          <input value={freshnessSec} onChange={(e) => setFreshnessSec(e.target.value)} className={input} />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-zinc-300">
        <input type="checkbox" checked={withSchema} onChange={(e) => setWithSchema(e.target.checked)} />
        Enforce JSON schema (symbol, price, timestamp required)
      </label>

      <p className="font-mono text-xs text-zinc-500">Mint: Devnet USDC {DEVNET_USDC_MINT}</p>

      {error && <p className="text-sm text-red-400">{error}</p>}
      <button disabled={busy} className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold hover:bg-emerald-500 disabled:opacity-50">
        {busy ? "Locking funds…" : "Create job & lock funds"}
      </button>
    </form>
  );
}
