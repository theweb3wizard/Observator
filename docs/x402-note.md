# x402 adapter note (Phase 8 → Checkpoint G)

Source: spec §13. Role recap: **x402 is the payment rail, Observator escrow is
the conditional settlement layer.** We reuse official x402 V2 SDKs; no custom
headers or hand-rolled payment payloads.

## What is live

`demo/provider` wraps `/good` and `/bad` with the official `@x402/fastify`
middleware (Solana devnet, `exact` scheme, test facilitator):

| Env | Default | Effect |
|---|---|---|
| `X402_ENABLED` | `0` | Endpoints open — E2E, tests, dashboard unaffected |
| `X402_ENABLED=1` | — | Unpaid `GET /good|/bad` → `402` + `PAYMENT-REQUIRED` header; valid `PAYMENT-SIGNATURE` → verified via facilitator → data served |
| `X402_FACILITATOR_URL` | `https://x402.org/facilitator` | Test facilitator (Solana devnet OK) |
| `X402_PAY_TO` | provider placeholder | Receives the $0.001 data-access fee |
| `X402_PRICE` | `$0.001` | Kept trivial next to the $0.10 escrowed job — on purpose |

Verified: free mode `200/200`; gated mode `402` on unpaid + `/health` open.
Paid-path (signature → facilitator verify → `200`) follows the standard buyer
flow — see "Manual paid-path test" below. It needs a funded signer, so it is
exercised at demo time, not in CI.

## Manual paid-path test (demo time)

1. Generate a buyer keypair, airdrop devnet SOL, fund devnet USDC (Circle faucet).
2. Use an x402 buyer client (`@x402/fetch` wrapper or the buyer quickstart at
   https://docs.x402.org/getting-started/quickstart-for-buyers) against
   `http://localhost:3003/good` with `X402_ENABLED=1`.
3. Expect: first request `402`, paid retry `200` with fresh payload, fee settled
   to `X402_PAY_TO` on Solana devnet.

## Why not deeper (documented scope decision)

The natural deep integration — `payTo` = the job's **escrow vault ATA**, so the
x402 payment itself funds escrow — requires Checkpoint B first (program ID +
vault address per job, plus per-job route config). The design is ready; the
wiring lands after the Playground deploy. Per spec §13.2 the core escrow demo
does not depend on x402, and this adapter sits *around* it, enabled by env flag.

References: https://docs.x402.org/getting-started/quickstart-for-sellers,
https://x402.org/, spec §37 links.
