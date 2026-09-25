"use client";
// Minimal Solana wallet connection: Phantom if present, address paste otherwise.
// (Full wallet-adapter suite is a post-hackathon upgrade; this covers the demo.)
import { useState } from "react";

declare global {
  interface Window {
    solana?: { connect: () => Promise<{ publicKey: { toBase58: () => string } }> };
  }
}

export default function WalletButton({
  address,
  onAddress,
}: {
  address: string;
  onAddress: (a: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setError(null);
    try {
      if (!window.solana) {
        setError("Phantom not detected — paste an address instead.");
        return;
      }
      const res = await window.solana.connect();
      onAddress(res.publicKey.toBase58());
      localStorage.setItem("observator.buyer", res.publicKey.toBase58());
    } catch {
      setError("Connection rejected.");
    }
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          value={address}
          onChange={(e) => onAddress(e.target.value.trim())}
          placeholder="Buyer wallet address"
          spellCheck={false}
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm"
        />
        <button
          type="button"
          onClick={connect}
          className="shrink-0 rounded bg-emerald-600 px-3 py-2 text-sm font-semibold hover:bg-emerald-500"
        >
          Connect
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-amber-400">{error}</p>}
    </div>
  );
}
