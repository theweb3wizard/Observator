# Submission narrative (Observator V1)

Source: spec §36. Claims calibrated to what is built and tested (§34 rules:
no "nobody else", no "invented escrow", no production-ready finance claims).

## Problem

Autonomous agents can increasingly discover and pay for internet-native services
(x402 and similar rails make the payment move). But payment and delivery
verification remain separate concerns. A human can inspect a result and decide
whether it was acceptable. An autonomous agent needs an executable settlement
policy — otherwise it pays for stale data, malformed output, and missed
deadlines with no standardized path to conditional release or refund.

## Solution

Observator lets a buyer define machine-verifiable delivery conditions and locks
payment in Solana escrow. When the provider delivers, Observator evaluates the
conditions deterministically: passing conditions release payment to the
provider; failed or expired conditions trigger the refund path to the buyer.
Agents use the same workflow through a standard MCP interface. x402 sits in
front as the request/payment rail; Observator is the condition between payment
and final settlement.

## Why now

Agentic payments are becoming practical through protocols such as x402. The
next problem is not "how does an agent pay?" but "how does an agent safely
settle a purchase when delivery has conditions?" That is the primitive this
prototype demonstrates, with both paths working: release on proof, refund on
failure.

## Why Solana

Conditional settlement for machine-to-machine services means frequent,
small-value transactions ($0.10 in our demo). Solana's low fees and fast
finality make that practical; the escrow state and settlement events live
on-chain on Devnet.

## What we show

1. Create a $0.10 conditional job (dashboard or MCP).
2. Funds lock in escrow; provider delivers.
3. Deterministic verification with per-check evidence.
4. `5/5 PASS → provider paid` and `freshness FAIL → buyer refunded`, both visible
   with transactions.
5. The same flow driven end-to-end by an MCP agent client.

## Future (explicitly not V1)

More verifier adapters (files, hashes, on-chain state, attestations), more
settlement policies (partial, milestones, disputes), history-backed reputation,
multi-provider procurement. V1 is the primitive: Job + Conditions + Evidence +
Verification + Settlement.
