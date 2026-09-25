import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Observator — Conditional settlement for agent payments",
  description:
    "Funds are released only when predefined, machine-verifiable delivery conditions pass.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
        <header className="border-b border-zinc-800">
          <nav className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
            <a href="/" className="font-mono text-lg font-bold tracking-tight">
              OBSERVATOR
            </a>
            <a href="/create" className="text-sm text-zinc-400 hover:text-zinc-100">
              Create job
            </a>
            <a href="/jobs" className="text-sm text-zinc-400 hover:text-zinc-100">
              Explorer
            </a>
            <span className="ml-auto font-mono text-xs text-zinc-500">Solana Devnet · V1</span>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
