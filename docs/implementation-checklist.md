# Implementation checklist (spec §§30–31, 35, 40)

## Phase 1 — Repo/env → Checkpoint A
- [x] Inspect repo (only spec file; no existing app to preserve)
- [x] Node 24.21.0 / npm 12.0.2 verified; Rust/Cargo/Anchor/Solana missing
- [x] Monorepo (npm workspaces) + TS base config + Anchor.toml + env example
- [x] README + docs (architecture, verification-spec, demo-script)
- [x] `npm install` clean + `dev:api` boots (verified: build OK, GET /health 200)
- [ ] Checkpoint A sign-off

## Phase 2 — Escrow → Checkpoint B
- [x] Skeleton with init/fund/release/refund/mark-expired + invariants
- [x] Decision: compile/test/deploy via Solana Playground (no local toolchain;
      laptop virtualization unavailable) — Checkpoint B = paste-build-deploy session
- [x] Playground build (success, 6.57s) + deploy to Devnet (success, ~10 min
      incl. devnet rate-limit retries). Program ID:
      `6yXXYuix6c93kfGhqv8fCseRa7pXTKx1pxCjcFeWToPx`
      (https://explorer.solana.com/address/6yXXYuix6c93kfGhqv8fCseRa7pXTKx1pxCjcFeWToPx?cluster=devnet).
      Backend derives real escrow PDAs from it (verified live).
      Fixed en route: Fund/Settle `mint` accounts (E0425), valid base58
      placeholder ID. On-chain attack-test suite (unauthorized/double-settle/
      wrong-mint) still to run as program tests — tracked, not claimed.
- [x] Checkpoint B sign-off (deploy green; program tests outstanding, see above)

## Phase 3 — Verification → Checkpoint C
- [x] 6 checks + result format + unit tests (valid, malformed, missing field,
      stale/fresh, timeout, deadline) — 11/11 green, `tsc` clean
- [x] Checkpoint C sign-off

## Phase 4 — Backend → Checkpoint D
- [x] POST /api/jobs, delivery, verify, settle per §28 + spec §15 tables
      (node:sqlite file-backed; fewest-services decision)
- [x] Full workflow test (good → release PENDING, bad → refund, idempotent
      settle, retry) — 17/17 green with Phase 3 suite, `tsc` clean
- [x] Checkpoint D sign-off (chain signatures attach at Checkpoint B)

## Phase 5 — Provider → Phase 6 — Frontend → Checkpoint E
- [x] /good (fresh) + /bad (stale 184s); live E2E verified:
      good → 5/5 PASS → release, bad → freshness FAIL → refund
- [x] Dashboard (home/create/explorer/job-detail+report) builds clean;
      all pages serve 200, CORS preflight passes, same tested endpoints
- [x] Checkpoint E sign-off (browser click-through = same API workflow)

## Phase 7 — MCP → Checkpoint F; Phase 8 — x402 → Checkpoint G
- [x] 6 tools via official TS SDK (stdio; protocol-tested with real client:
      list, good→release+report, bad→refund, early-settle rejected) → F
- [x] x402 adapter live (provider 402-gate, Solana devnet exact, env-flagged;
      free mode unchanged; paid path = standard buyer flow, see docs/x402-note.md) → G

## Phase 9–10 → Checkpoint H
- [x] Attack/failure tests (24/24 api incl. forged claims, frozen state,
      timeout refund, down-provider, corrupt config, oversize, evil redirect;
      3/3 mcp; web builds; hygiene: no .env, no secret patterns)
- [x] Fixed in hardening: expired-unverified → refund; verify/deliver frozen
      after settlement; verify failures fail closed (500, never settle)
- [ ] Clean-env good+bad demos with real txs (needs Checkpoint B) → H

## Definition of Done (§35)
Core, security, demo, agent, presentation boxes — all unchecked until H.
