# Observator

**Conditional settlement layer for machine-to-machine payments (Solana Devnet).**

> An agent should not have to blindly pay for a service just because the provider
> says the service was delivered. Observator holds the payment until predefined,
> machine-verifiable delivery conditions are satisfied.

Authoritative spec: `OBSERVATOR_MASTER_BUILD_SPEC.md` (build-locked).

## Product in one line

Observator lets AI agents pay for services conditionally — funds are released
only when predefined, machine-verifiable delivery conditions pass.

## What is Observator?

**Observator is a conditional settlement layer for machine-to-machine payments
on Solana.** A buyer (human or AI agent) locks payment in on-chain escrow
alongside machine-readable acceptance criteria. A deterministic verification
engine checks the provider's delivery against those criteria. Payment releases
to the provider only if every check passes; otherwise the buyer is refunded.
Settlement policy is executable code, not trust.

## Key facts

| Fact | Value |
|---|---|
| Network | Solana Devnet (testnet funds only) |
| Asset | Devnet USDC (6 decimals) |
| Settlement rule | Deterministic checks; no LLM controls funds |
| Agent interface | MCP server, 6 tools, stdio transport |
| Payment rail | x402 V2 adapter (Solana devnet, `exact` scheme) |
| Checks (V1) | HTTP status, JSON schema, required fields, freshness, deadline, latency |
| Demo | $0.10 job: fresh data → release; stale (184s) data → refund |
| Status | Working prototype; escrow program written, Devnet deploy in progress |

## Architecture

```text
Buyer/Agent -> Observator API -> Solana escrow (funds locked)
-> Provider delivery -> Verification engine (deterministic checks)
-> settle: PASS => provider, FAIL/expire => buyer
```

`docs/architecture.md` · verification contract `docs/verification-spec.md` ·
demo `docs/demo-script.md` · x402 adapter `docs/x402-note.md` ·
submission story `docs/submission-narrative.md` · judge Q&A `docs/judge-qa.md` ·
progress `docs/implementation-checklist.md`.

## Repo layout (spec §27, npm workspaces)

```text
apps/api/                  backend: jobs, verification, settlement (Phases 3-4, 9)
apps/web/                  Next.js dashboard (Phase 6)
apps/mcp/                  MCP server, stdio (Phase 7)
programs/observator-escrow/ Anchor escrow program (Phase 2 → Playground deploy)
demo/provider/             good/bad provider + x402 gate (Phases 5, 8)
docs/                      architecture, spec, demo, narrative, checklist
```

## Prerequisites

- Node.js 20+ and a browser. That's it for everything except the on-chain deploy.
- No Rust, Solana CLI, Anchor, WSL, Docker, or virtualization needed on this machine:
  the escrow program compiles/deploys via **Solana Playground** in the browser
  (Checkpoint B, steps below).
- Devnet SOL + Devnet USDC (faucets) for the Playground wallet at deploy/demo time.

## Quick start

```powershell
Copy-Item .env.example .env
npm install

# Terminal 1 — demo provider (:3003, /good fresh, /bad stale 184s)
npm run dev:provider

# Terminal 2 — API (:3001)
$env:ALLOW_PRIVATE_HOSTS = "1"   # dev only: permits localhost evidence URLs
npm run dev:api

# Terminal 3 — dashboard (:3000)
npm run dev:web
```

Open http://localhost:3000 → Create job → use `/good`, then repeat with `/bad`.
Good path verifies `PASS` → `release`; bad path fails freshness → `refund`.

## Tests

```powershell
npm run test --workspace apps/api   # 24: engine + workflow + attack/failure
npm run test --workspace apps/mcp   # 3: MCP protocol over live backend
npm run build --workspace apps/web  # dashboard production build
```

## MCP client config

```json
{
  "mcpServers": {
    "observator": {
      "command": "node",
      "args": ["C:/path/to/Observator/apps/mcp/dist/index.js"],
      "env": { "OBSERVATOR_API_URL": "http://localhost:3001" }
    }
  }
}
```

Tools: `create_conditional_job`, `get_job`, `submit_delivery`, `verify_job`,
`settle_job`, `get_verification_report`. Build first: `npm run build --workspace apps/mcp`.

## x402 (request/payment adapter, spec §13)

```powershell
$env:X402_ENABLED = "1"   # provider returns 402 without payment (Solana devnet, exact $0.001)
npm run dev:provider
```

Default `0`: endpoints open, everything else unaffected. Details: `docs/x402-note.md`.

## Checkpoint B — escrow deploy via Playground (browser, ~15 min)

1. Open https://beta.solpg.io, create an Anchor project, fund the Playground wallet
   with devnet SOL (terminal: `solana airdrop 5`, or the web faucet).
2. Replace `src/lib.rs` with `programs/observator-escrow/src/lib.rs`.
   Set `Cargo.toml` dependencies to the Playground's Anchor version
   (if it differs from our pinned `0.30.1`, align the two — one-line change).
3. `build`, then `deploy` (cluster: devnet). Record the program ID + tx signatures.
4. Back here: set `NEXT_PUBLIC_PROGRAM_ID=<id>` in `.env`, restart the API —
   new jobs now derive real escrow addresses (`findProgramAddress(["escrow", sha256(jobId)])`).
5. Run the Anchor test checklist (init, fund, release, refund, expiry, unauthorized
   release/refund, double-settle, wrong amount/recipient) and paste results into
   `docs/implementation-checklist.md` Checkpoint B.

Until then, settlements record `PENDING` with `signature: null` (spec §24) —
real decisions, deferred signatures, never faked.

## Env

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_PROGRAM_ID` | Escrow program ID (set at Checkpoint B; escrow derivation is `null` until then) |
| `NEXT_PUBLIC_USDC_MINT` | Devnet USDC `4zMMC9srt5Ri5X14GAgXhaHii3Gn9VQTzRpWhq1FUD9` |
| `SOLANA_RPC_URL` | Devnet RPC |
| `DATABASE_URL` | sqlite path (default `./data/observator.db`); Postgres can replace `apps/api/src/db.ts` |
| `ALLOW_PRIVATE_HOSTS` | `1` for localhost evidence in dev; never in prod |
| `ALLOWED_ORIGINS` | CORS allowlist (default open for local dashboard) |
| `OBSERVATOR_API_URL` | Backend URL for the MCP server |
| `X402_ENABLED / X402_FACILITATOR_URL / X402_PAY_TO / X402_PRICE` | x402 gate (see `docs/x402-note.md`) |

## FAQ

**Does Observator replace x402?**
No. x402 moves the payment; Observator governs its final settlement. The demo
provider accepts x402 micropayments for data access while the $0.10 job escrow
decides release vs refund. See `docs/x402-note.md`.

**Does AI decide who gets paid?**
No. AI may help draft conditions, and agents drive the workflow via MCP — but
the release/refund decision is computed by a deterministic engine from
check evidence. LLM output never touches the money path.

**Which blockchains are supported?**
V1 targets Solana Devnet only. The escrow layer is chain-specific; the
Job + Conditions + Evidence + Verification + Settlement abstraction is designed
to outlive any single chain.

**How do agents connect?**
Via the MCP server (`apps/mcp`): `create_conditional_job`, `get_job`,
`submit_delivery`, `verify_job`, `settle_job`, `get_verification_report` —
over stdio, against the same backend as the dashboard.

**What can it verify today?**
API/data deliveries: HTTP status, JSON shape, required fields, timestamp
freshness, deadline adherence, response latency. File, hash, on-chain-state,
and attestation verifiers are future adapters.

**Is this production financial infrastructure?**
No. It is a hackathon prototype demonstrating the primitive end-to-end, with
27 automated tests and honestly labeled pending items (notably the Devnet
program deploy). Do not custody real funds with it.

## Status

Green: **A** (repo/env), **C** (verification), **D** (backend), **E** (frontend),
**F** (MCP), **G** (x402). Pending: **B** (browser deploy, steps above),
**H** (clean-env good+bad demos with real txs). See `docs/implementation-checklist.md`.
