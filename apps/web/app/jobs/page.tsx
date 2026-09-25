"use client";
// Explorer — list jobs (spec §16 §5, optional but cheap on the existing API).
import { useEffect, useState } from "react";
import { api, formatUsdc, type Job } from "@/lib/api";

const STATUS_STYLE: Record<string, string> = {
  CREATED: "text-zinc-300 border-zinc-600",
  DELIVERED: "text-blue-400 border-blue-800",
  PASSED: "text-emerald-400 border-emerald-800",
  FAILED: "text-red-400 border-red-800",
  SETTLEMENT_PENDING: "text-amber-400 border-amber-800",
  SETTLED: "text-emerald-400 border-emerald-800",
  EXPIRED: "text-zinc-500 border-zinc-700",
};

export default function Jobs() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listJobs().then((r) => setJobs(r.jobs)).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-sm text-red-400">Failed to load jobs: {error}</p>;
  if (!jobs) return <p className="text-sm text-zinc-500">Loading…</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Jobs</h1>
      {jobs.length === 0 && <p className="text-sm text-zinc-500">No jobs yet.</p>}
      {jobs.map((j) => (
        <a
          key={j.id}
          href={`/jobs/${j.id}`}
          className="block rounded border border-zinc-800 bg-zinc-900 p-4 hover:border-zinc-600"
        >
          <div className="flex items-center gap-3">
            <code className="font-mono text-sm">{j.id}</code>
            <span
              className={`rounded border px-2 py-0.5 font-mono text-xs ${STATUS_STYLE[j.status] ?? STATUS_STYLE.CREATED}`}
            >
              {j.status}
            </span>
            <span className="ml-auto font-mono text-sm text-emerald-400">
              ${formatUsdc(j.amount)} USDC
            </span>
          </div>
          <p className="mt-1 truncate font-mono text-xs text-zinc-500">{j.providerUrl}</p>
        </a>
      ))}
    </div>
  );
}
