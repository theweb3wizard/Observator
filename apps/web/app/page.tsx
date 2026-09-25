// Home — spec §16: conditional payments for autonomous services.
export default function Home() {
  return (
    <div className="space-y-10">
      <section className="space-y-4 pt-6">
        <h1 className="text-4xl font-bold tracking-tight">
          Conditional payments for autonomous services.
        </h1>
        <p className="max-w-2xl text-zinc-400">
          Observator lets AI agents pay for services conditionally — funds are locked in
          Solana escrow and released only when predefined, machine-verifiable delivery
          conditions pass.
        </p>
        <p className="font-mono text-sm text-emerald-400">PAY → VERIFY → RELEASE</p>
        <div className="flex gap-3 pt-2">
          <a
            href="/create"
            className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold hover:bg-emerald-500"
          >
            Create a conditional job
          </a>
          <a
            href="/jobs"
            className="rounded border border-zinc-700 px-4 py-2 text-sm hover:border-zinc-500"
          >
            Explore jobs
          </a>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          {
            t: "1 · Lock",
            d: "Buyer defines amount, provider, deadline, and machine-readable acceptance criteria. Payment sits in escrow — not with the provider.",
          },
          {
            t: "2 · Verify",
            d: "The provider delivers. A deterministic engine checks HTTP status, JSON shape, required fields, freshness, deadline, and latency.",
          },
          {
            t: "3 · Settle",
            d: "All checks pass → provider is paid. Anything fails or expires → the buyer is refunded. Every step is on record.",
          },
        ].map((s) => (
          <div key={s.t} className="rounded border border-zinc-800 bg-zinc-900 p-4">
            <h2 className="font-mono text-sm font-bold text-emerald-400">{s.t}</h2>
            <p className="mt-2 text-sm text-zinc-400">{s.d}</p>
          </div>
        ))}
      </section>

      <section className="rounded border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
        <span className="font-semibold text-zinc-200">Demo in 60 seconds: </span>
        create a $0.10 job against the demo provider&apos;s{" "}
        <code className="font-mono text-emerald-400">/good</code> endpoint, watch 5/5
        checks release payment — then repeat with{" "}
        <code className="font-mono text-red-400">/bad</code> and watch the stale
        timestamp trigger a refund.
      </section>
    </div>
  );
}
