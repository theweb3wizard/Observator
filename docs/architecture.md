# Architecture (Observator V1)

Source: `OBSERVATOR_MASTER_BUILD_SPEC.md` §§7–8, 14–15.

## Flow

```text
Buyer/Agent --create job--> Observator API --create escrow--> Solana program
Solana program --funds locked--> Provider API --delivery evidence--> Verification engine
Verification engine --pass/fail--> Observator API --settle--> Solana program
Solana program --pass--> Provider | --fail/expire--> Buyer
```

## Components

- **Solana escrow (`programs/observator-escrow`)**: init/fund/release/refund/
  mark-expired; states `Open | Released | Refunded | Expired`; emits events;
  enforces §8 invariants (authorized verifier only, no double-settle, locked
  amount/mint/deadline/destinations).
- **Verification engine (`apps/api/src/verification`, Phase 3)**: deterministic
  checks only — `http_status`, `json_schema`, `required_fields`,
  `max_age_seconds`, `deadline`, `max_latency_ms`. Never LLM-decided.
- **Backend (`apps/api`, Phases 4+9)**: job lifecycle, Zod-validated specs,
  evidence fetching with SSRF/timeout/size guards, settlement orchestration,
  event indexing, dashboard + MCP APIs. Never trusts client `verified:true`
  (proven by test). Settlement decisions are idempotent `PENDING` rows with
  `signature: NULL` until Checkpoint B attaches chain signatures (spec §24);
  post-settlement state is frozen (`409 settlement_final`); expired-unverified
  jobs refund (timeout refund).
- **DB (Phase 4)**: `jobs`, `conditions`, `deliveries`, `verification_runs`,
  `settlements` — no extra tables unless required.
- **Demo provider (`demo/provider`, Phases 5+8)**: `/good` fresh vs `/bad`
  stale; optional x402 gate (`X402_ENABLED=1` → Solana-devnet `exact` $0.001
  via official SDK, `/health` open). Free mode is the default.
- **Frontend (`apps/web`, Phase 6)**: dashboard around working workflow.
- **MCP (`apps/mcp`, Phase 7)**: stdio tools over the same backend; condition
  shapes imported from the backend contract (no drift).

## Security notes (§23–24)

On-chain tests cover unauthorized/double/wrong-recipient/wrong-mint/amount/
expiry/replay/bad-transitions. Backend never stores keys, never trusts client
verification. Verifier treats evidence as untrusted (allowlist, timeout,
size limits, no internal-network access). Chain failures → `SETTLEMENT_PENDING`,
retryable, never marked settled without signature.
