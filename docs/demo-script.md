# Demo script (Observator V1)

Source: spec §§3, 17–18. The two-path demo is mandatory. Lines in quotes are
say-lines; everything else is actions. Total ~6 minutes.

## Setup (before recording)

API + provider + dashboard running (see README Quick start). For the on-chain
version, Checkpoint B must be done so `NEXT_PUBLIC_PROGRAM_ID` is set and
settlements carry real signatures; otherwise narrate PENDING decisions honestly
as "recorded, signature attaches at deploy."

## Scene 1 — Problem (30s)

> "Today an autonomous agent can pay for a service, but payment does not mean
> the service met the conditions the agent needed. A human would inspect the
> result. An agent needs an executable rule."

## Scene 2 — Create job (45s)

Dashboard → Create job:

```text
Service: BTC Market Data — http://localhost:3003/good
Price: $0.10 USDC (Devnet)
Deadline: 5 minutes
Requirements: HTTP 200 · valid JSON · symbol/price/timestamp · freshness < 60s
```

Submit → job page shows `CREATED` with terms, conditions, deadline countdown.

## Scene 3 — Lock funds (20s)

> "The $0.10 doesn't go to the provider. It sits in Observator escrow —
> `AWAITING DELIVERY`."

Show the escrow address (or its derivation note pre-B) and the lock transaction
(post-B: Solana Explorer link).

## Scene 4 — Deliver (15s)

Provider evidence submitted (prefilled endpoint → Deliver). Delivery row appears
with timestamp.

## Scene 5 — Verify (45s)

Run verification. Read each check aloud as it lands:

```text
✓ HTTP 200 (expected 200, actual 200)
✓ Required fields (symbol, price, timestamp present)
✓ Valid JSON
✓ Freshness (age 0s < 60s max)
✓ Delivered before deadline
```

## Scene 6 — Settle success (30s)

```text
5/5 checks passed — RESULT: PAYMENT RELEASED
```

Settle → `release`. Show the transaction (post-B: Explorer; pre-B: the recorded
PENDING decision with its explicit note).

## Scene 7 — Failure path (60s)

New job, same form, endpoint `/bad`. Deliver → verify:

```text
✓ HTTP 200
✓ Required fields
✓ Valid JSON
✗ Freshness (age 184s > 60s max) — stale_timestamp
✓ Delivered before deadline

4/5 passed, 1 failed — RESULT: PAYMENT REFUNDED
```

Settle → `refund`. Say: "Same rail, same code — the conditions decided, not us."

## Scene 8 — Agent interface (60s)

> "Now the same workflow, but the buyer is an AI agent using standard tools."

Via MCP (`create_conditional_job → get_job → submit_delivery → verify_job →
get_verification_report → settle_job`): create, deliver, show the report text
(`✓/✗` lines + RESULT), settle. This is the "wow" layer: no dashboard clicks.

## Scene 9 — x402 layer (30s, optional)

> "x402 is how the agent pays for data access. Observator is what makes that
> payment conditional."

With `X402_ENABLED=1`: unpaid `curl` → `402 + PAYMENT-REQUIRED`; paid request →
data. The $0.001 access fee and the $0.10 escrowed job are separate layers.

## What to show on screen throughout

Job ID, status pill transitions, each check with its evidence values, and the
settlement row (action + signature/Explorer link or PENDING note). Never show a
step succeeding without its evidence visible.
