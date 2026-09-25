# OBSERVATOR
## Hackathon Master Context + PRD + Technical Specification + Build Plan

**Status:** BUILD LOCKED  
**Target:** Colosseum Crypto World's Fair 2026  
**Build horizon:** ~14 days remaining  
**Primary network:** Solana Devnet  
**Primary asset:** Devnet USDC  
**Product category:** Agentic commerce / conditional settlement / verification  
**Working product name:** Observator

---

# 1. Executive Summary

## 1.1 What we are building

Observator is a **conditional settlement layer for machine-to-machine payments**.

The core promise is:

> **An agent should not have to blindly pay for a service just because the provider says the service was delivered. Observator holds the payment until predefined, machine-verifiable delivery conditions are satisfied.**

For the hackathon, we are intentionally narrowing this to one concrete workflow:

1. A buyer/AI agent wants to purchase a paid API/service.
2. The buyer creates a job with:
   - payment amount,
   - provider,
   - deadline,
   - machine-readable acceptance criteria.
3. The payment is deposited into an on-chain Observator escrow vault.
4. The provider performs the work and submits delivery evidence.
5. Observator's verification engine executes deterministic checks against the evidence/service.
6. If every required condition passes, the escrow releases payment to the provider.
7. If the deadline expires or the defined conditions fail, the buyer can receive a refund according to the job's rules.
8. Every important event is recorded and visible in the dashboard.

The product is NOT:

- a generic AI agent wallet;
- a generic payment processor;
- a generic Solana security scanner;
- a generic reputation system;
- a claim that an AI can objectively judge every kind of service;
- a full legal dispute-resolution system.

The V1 is a **machine-verifiable conditional payment protocol**.

---

# 2. The Product Thesis

## 2.1 The problem

Current machine-to-machine payments answer:

> "Did money move?"

They do not automatically answer:

> "Did the purchased service satisfy the agreed machine-checkable conditions?"

For an autonomous agent, this distinction matters.

A human can inspect a result, complain, request a refund, or negotiate with a provider.

An autonomous software agent needs a programmable settlement rule.

Without such a rule, the agent can:

- pay for an API response and receive invalid data;
- pay for a service that misses a deadline;
- pay for malformed output;
- pay for an output that fails required constraints;
- receive no standardized automatic path for conditional release/refund.

Observator turns the agreement into executable verification conditions.

---

# 3. The Narrow V1 Workflow

## 3.1 Demo scenario

Use a deliberately simple but convincing example:

### Buyer
An AI agent needs a market-data/API service.

### Provider
A paid API provides a JSON result.

### Contract

The buyer agrees to pay **$0.10 USDC** if the provider returns:

- HTTP 200;
- valid JSON;
- required fields:
  - `symbol`
  - `price`
  - `timestamp`;
- `timestamp` no older than a specified freshness threshold;
- response arrives before the deadline;
- optional maximum response latency.

### Settlement

Payment goes to the Observator escrow vault.

The provider submits the result.

Observator verifies the result.

If all conditions pass:

**Escrow → Provider**

If conditions fail or the job expires:

**Escrow → Buyer**

This is the central demo.

---

# 4. Why This Is the Right Scope

The wider problem of "trust in agentic commerce" is too large.

We are NOT attempting to solve all of it.

We are demonstrating one important primitive:

> **Programmable payment release based on objectively verifiable service conditions.**

This is small enough to build but broad enough to become infrastructure.

The architecture should make future extensions possible without pretending they are part of V1.

---

# 5. Product Positioning

## One-line pitch

**Observator lets AI agents pay for services conditionally — funds are released only when predefined, machine-verifiable delivery conditions pass.**

## Short pitch

> x402 makes it possible for agents to pay for internet services. Observator adds a programmable settlement layer: instead of immediately treating payment as final, the payment can be held in escrow and released only when the purchased service satisfies explicit verification rules.

## Judge-friendly explanation

Do NOT say:

> "We use AI to determine whether an API response is good."

Say:

> "The buyer defines machine-verifiable acceptance criteria. Observator converts those criteria into executable checks and uses their results to determine settlement."

AI may assist with creating or explaining a verification specification, but **AI does not have unilateral authority to release funds.**

That distinction is critical.

---

# 6. Product Principles

1. **Deterministic settlement**
   - Money movement should depend on explicit rules.
   - LLM output must never directly control fund release.

2. **Verifiable evidence**
   - Every verification result should explain exactly what passed or failed.

3. **On-chain finality**
   - Escrow state and settlement events live on Solana.

4. **Off-chain computation where appropriate**
   - HTTP requests, JSON validation, latency measurement, and similar checks occur off-chain.
   - Their results are committed to the escrow workflow.

5. **Minimal V1**
   - One escrow program.
   - One verification engine.
   - One service type.
   - One dashboard.
   - One MCP interface.
   - One polished end-to-end demo.

6. **Do not build infrastructure just because it sounds impressive.**
   - Reuse standard x402 components.
   - Use Anchor for the Solana program.
   - Use MCP rather than inventing an agent interface.

---

# 7. Architecture Overview

```text
                         ┌─────────────────────┐
                         │   Buyer / AI Agent  │
                         └──────────┬──────────┘
                                    │
                                    │ create job
                                    ▼
                         ┌─────────────────────┐
                         │    Observator API   │
                         └──────────┬──────────┘
                                    │
                     create escrow  │
                                    ▼
                         ┌─────────────────────┐
                         │  Solana Program     │
                         │  Conditional Escrow │
                         └──────────┬──────────┘
                                    │
                              funds locked
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │     Provider API    │
                         └──────────┬──────────┘
                                    │
                              delivery evidence
                                    ▼
                         ┌─────────────────────┐
                         │ Verification Engine │
                         │                     │
                         │ HTTP status         │
                         │ JSON schema         │
                         │ required fields     │
                         │ freshness           │
                         │ deadline            │
                         │ latency             │
                         └──────────┬──────────┘
                                    │
                         pass/fail verification
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │  Observator API     │
                         └──────────┬──────────┘
                                    │
                             settle instruction
                                    ▼
                         ┌─────────────────────┐
                         │  Solana Program     │
                         └───────┬─────┬───────┘
                                 │     │
                              pass     fail/expire
                                 │     │
                                 ▼     ▼
                              Provider Buyer
```

---

# 8. Components

## 8.1 Solana Conditional Escrow Program

Technology:

- Rust
- Anchor
- Solana Devnet
- SPL Token / USDC

Responsibilities:

- initialize escrow;
- lock funds;
- store job/escrow metadata;
- record expected verification state;
- accept authorized settlement instruction;
- release funds to provider after successful verification;
- refund buyer after failed/expired conditions;
- prevent double settlement;
- enforce deadline;
- emit useful events.

The program should be intentionally simple.

### Suggested states

```text
Created
Funded
AwaitingDelivery
Verifying
Approved
Rejected
Refunded
Expired
Settled
```

Prefer a smaller actual enum if possible:

```text
Open
Released
Refunded
Expired
```

The backend can maintain richer off-chain status.

### Critical invariants

The program MUST enforce:

- buyer cannot withdraw provider funds;
- provider cannot unilaterally release funds to itself;
- escrow cannot settle twice;
- only authorized verifier/settler can call settlement;
- settlement destination must match the escrow configuration;
- refund destination must match buyer;
- amount cannot change after funding;
- deadline cannot be extended without explicit authorization;
- wrong mint cannot be accepted;
- wrong escrow/job cannot be settled.

---

# 9. Verification Engine

## 9.1 Important design decision

The Verification Engine is NOT an AI judge.

It is a deterministic execution engine.

Its job is:

```text
Verification Specification
        ↓
Execute Checks
        ↓
Pass / Fail + Evidence
        ↓
Settlement Decision
```

## 9.2 V1 verification types

Implement only checks that can be demonstrated reliably.

### Check A — HTTP status

Example:

```json
{
  "type": "http_status",
  "expected": 200
}
```

### Check B — JSON schema

Example:

```json
{
  "type": "json_schema",
  "schema": {
    "type": "object",
    "required": ["symbol", "price", "timestamp"]
  }
}
```

### Check C — required fields

Example:

```json
{
  "type": "required_fields",
  "fields": ["symbol", "price", "timestamp"]
}
```

### Check D — freshness

Example:

```json
{
  "type": "max_age_seconds",
  "field": "timestamp",
  "max": 60
}
```

### Check E — deadline

The verification service records:

- request time;
- delivery time;
- configured deadline.

### Check F — maximum latency

Optional.

```json
{
  "type": "max_latency_ms",
  "max": 2000
}
```

---

# 10. Verification Result Format

Every check should produce structured evidence.

Example:

```json
{
  "jobId": "job_123",
  "overall": "PASS",
  "checks": [
    {
      "type": "http_status",
      "status": "PASS",
      "expected": 200,
      "actual": 200
    },
    {
      "type": "required_fields",
      "status": "PASS",
      "required": ["symbol", "price", "timestamp"],
      "missing": []
    },
    {
      "type": "freshness",
      "status": "PASS",
      "ageSeconds": 12,
      "maxAgeSeconds": 60
    }
  ],
  "verifiedAt": "..."
}
```

For a failed job:

```json
{
  "overall": "FAIL",
  "checks": [
    {
      "type": "freshness",
      "status": "FAIL",
      "ageSeconds": 184,
      "maxAgeSeconds": 60
    }
  ]
}
```

This evidence must be visible in the UI.

---

# 11. Where AI Fits

AI is useful, but it must not become the source of truth.

## 11.1 AI-assisted contract creation

A user can type:

> "Pay $0.10 if the API returns a valid BTC price, contains a timestamp, and the data is less than one minute old."

The AI can convert this into:

```json
{
  "checks": [
    {
      "type": "http_status",
      "expected": 200
    },
    {
      "type": "required_fields",
      "fields": ["symbol", "price", "timestamp"]
    },
    {
      "type": "max_age_seconds",
      "field": "timestamp",
      "max": 60
    }
  ]
}
```

The user must be able to inspect/edit the resulting contract.

The deterministic engine executes the contract.

## 11.2 Optional AI explanation

After verification:

> "Payment was rejected because the timestamp was 184 seconds old, exceeding the allowed 60 seconds."

AI can make the explanation more natural, but the underlying evidence remains deterministic.

## 11.3 AI must NOT

- decide whether to release funds;
- override a failed check;
- invent verification evidence;
- create arbitrary settlement transactions;
- access private escrow keys.

---

# 12. MCP Interface

Observator should expose an MCP server.

Reason:

AI agents should be able to interact with Observator using standard tools instead of a custom integration.

Use the current MCP TypeScript SDK.

Suggested tools:

### `create_conditional_job`

Input:

```json
{
  "providerUrl": "...",
  "amount": "0.10",
  "asset": "USDC",
  "deadlineSeconds": 300,
  "conditions": [...]
}
```

Output:

```json
{
  "jobId": "...",
  "escrowAddress": "...",
  "fundingInstructions": "..."
}
```

### `get_job`

Returns current state and verification status.

### `submit_delivery`

Input:

```json
{
  "jobId": "...",
  "evidenceUrl": "...",
  "metadata": {}
}
```

### `verify_job`

Runs deterministic verification.

### `settle_job`

Only callable after verification reaches a valid settlement state.

### `get_verification_report`

Returns human-readable and machine-readable evidence.

The MCP server is an interface into Observator, not the escrow itself.

---

# 13. x402 Integration

## 13.1 Role of x402

Do not rebuild x402.

Use x402 as the payment/request protocol.

Observator adds the conditional settlement layer.

The conceptual stack becomes:

```text
AI Agent
   ↓
x402 request/payment
   ↓
Observator conditional escrow
   ↓
Provider service
   ↓
Verification
   ↓
Settlement
```

For V1, it is acceptable to make the x402 integration a focused adapter rather than attempting to support every x402 scheme.

Use the current x402 V2 architecture and libraries.

## 13.2 Important constraint

The current x402 Solana implementation has specific verification/settlement semantics.

Do not invent custom x402 headers or manually concatenate protocol payloads.

Use the official SDKs.

If integrating x402 directly into the escrow flow becomes a schedule risk, preserve the core Observator escrow demo and implement x402 as the request/payment-facing adapter around it.

The hackathon demo must remain functional even if one integration layer fails.

---

# 14. Backend

Recommended:

- TypeScript
- Node.js
- Fastify or Express
- Zod
- PostgreSQL/Supabase
- Solana web3/kit libraries as required by the current SDKs
- Anchor-generated client/IDL

Responsibilities:

- job creation;
- verification specification validation;
- provider/evidence requests;
- verification execution;
- settlement orchestration;
- event indexing;
- dashboard API;
- MCP server integration.

The backend is NOT trusted with arbitrary fund custody.

The backend should only submit valid settlement instructions to the Solana program.

---

# 15. Database

Use a simple relational schema.

## `jobs`

```text
id
buyer_address
provider_address
escrow_address
amount
mint
status
deadline
created_at
updated_at
```

## `conditions`

```text
id
job_id
type
config_json
required
```

## `deliveries`

```text
id
job_id
evidence_url
submitted_at
metadata_json
```

## `verification_runs`

```text
id
job_id
status
results_json
started_at
completed_at
```

## `settlements`

```text
id
job_id
action
signature
created_at
```

Do not create additional tables unless required.

---

# 16. Frontend

Recommended:

- Next.js
- TypeScript
- Tailwind CSS
- wallet connection appropriate for Solana
- clean dashboard UI

The interface should feel like a serious infrastructure product, not a generic hackathon dashboard.

## Main pages

### 1. Home

Explain:

> "Conditional payments for autonomous services."

Show a simple visual:

```text
PAY → VERIFY → RELEASE
```

### 2. Create Job

Fields:

- provider endpoint;
- amount;
- deadline;
- verification conditions;
- buyer wallet.

### 3. Job Detail

Show:

- amount;
- buyer;
- provider;
- escrow address;
- current state;
- deadline;
- conditions;
- delivery evidence;
- verification checks;
- settlement transaction.

### 4. Verification Report

Show every check:

```text
✓ HTTP 200
✓ Required fields
✓ Valid JSON
✓ Freshness < 60 sec
✓ Delivered before deadline

RESULT: PAYMENT RELEASED
```

For failure:

```text
✓ HTTP 200
✓ Required fields
✗ Freshness < 60 sec

RESULT: PAYMENT REFUNDED
```

### 5. Explorer / Activity

Optional if time permits.

---

# 17. Demo Provider

Build a tiny fake-but-real HTTP service.

It should support two modes:

## Good response

```json
{
  "symbol": "BTC",
  "price": 112000,
  "timestamp": 1790000000
}
```

## Bad response

Example:

```json
{
  "symbol": "BTC",
  "price": 112000,
  "timestamp": 1789999000
}
```

The timestamp should deliberately violate the freshness requirement.

This allows the demo to show both:

### Successful path

```text
Agent
→ pays
→ provider delivers
→ verification passes
→ provider receives funds
```

### Failure path

```text
Agent
→ pays
→ provider delivers bad/stale result
→ verification fails
→ buyer receives refund
```

This two-path demo is mandatory.

---

# 18. End-to-End Demo Script

## Scene 1 — Problem

Say:

> "Today an autonomous agent can pay for a service, but payment does not necessarily mean the service met the conditions the agent needed."

Do not spend five minutes explaining the entire agent economy.

## Scene 2 — Create job

Create:

```text
Service: BTC Market Data
Price: $0.10 USDC
Deadline: 2 minutes

Requirements:
- HTTP 200
- valid JSON
- symbol present
- price present
- timestamp present
- timestamp < 60 seconds old
```

## Scene 3 — Lock funds

Show:

```text
$0.10 USDC
        ↓
Observator Escrow
        ↓
AWAITING DELIVERY
```

Show the Solana transaction.

## Scene 4 — Provider delivers

Provider submits response.

## Scene 5 — Verification

Show each check executing.

## Scene 6 — Successful settlement

Show:

```text
5/5 checks passed

PAYMENT RELEASED
```

Show transaction.

## Scene 7 — Failure

Run second job with stale timestamp.

Show:

```text
4/5 checks passed
1/5 failed

PAYMENT REFUNDED
```

Show refund transaction.

## Scene 8 — Agent interface

Demonstrate the same workflow through MCP.

The agent can:

```text
create job
→ inspect status
→ submit delivery
→ retrieve verification report
→ observe settlement
```

This is the "wow" layer.

---

# 19. The Core Differentiator

Do not claim:

> "Nobody else has thought of escrow."

That claim is false and unnecessary.

Our differentiation is the combination:

```text
x402 / agent payments
        +
machine-readable service contracts
        +
deterministic verification
        +
Solana escrow
        +
automatic conditional settlement
        +
MCP-native agent interface
```

The hackathon story is:

> "We are not building another payment rail. We are building the missing programmable condition between payment and final settlement."

---

# 20. Competitive Positioning

Competitors or adjacent projects may already have:

- agent wallets;
- spending limits;
- payment protocols;
- escrow;
- reputation;
- verification;
- x402 integrations.

That is acceptable.

The product must not attempt to win by saying:

> "We invented conditional payments."

Instead:

> "We packaged conditional settlement around machine-verifiable service contracts and made it usable by agents."

The product should be architected as an integration layer.

That makes future competition less threatening because Observator can sit on top of payment infrastructure instead of replacing it.

---

# 21. Long-Term Product

V1 is only the primitive.

The long-term company/product could become:

## Observator — Trust and settlement infrastructure for autonomous commerce

Potential future modules:

### 1. More verification adapters

- API response verification
- file delivery
- data freshness
- cryptographic hashes
- on-chain state verification
- signed attestations
- benchmark tests
- computation verification
- oracle-backed conditions

### 2. More payment rails

- x402
- direct Solana payments
- other chains
- stablecoins

### 3. More settlement policies

- release on success;
- partial payment;
- automatic refund;
- timeout refund;
- milestone settlement;
- dispute escalation.

### 4. Reputation

Only after real usage.

Store historical:

- completion rate;
- failure rate;
- average delivery time;
- dispute rate;
- verification failures.

### 5. Agent procurement

Eventually an agent could ask:

> "Find me the cheapest provider that has 98%+ successful verified deliveries."

That is a future product layer.

Do not build this now.

---

# 22. What Makes This Scalable

The key abstraction is not "API escrow."

It is:

```text
Job
+
Conditions
+
Evidence
+
Verification
+
Settlement
```

If the verification interface remains generic, new service categories can plug into the same system.

Example:

```text
API service
      ↓
HTTP verifier

File delivery
      ↓
File/hash verifier

Blockchain action
      ↓
On-chain verifier

Compute result
      ↓
Computation verifier
```

The escrow layer stays largely the same.

That is the intended architecture for future growth.

---

# 23. Security Model

This is a hackathon prototype, not production financial infrastructure.

Still, the code should demonstrate serious security thinking.

## On-chain

Test:

- unauthorized release;
- unauthorized refund;
- double settlement;
- wrong escrow;
- wrong recipient;
- wrong token;
- amount manipulation;
- expired job;
- replay;
- invalid state transition.

## Backend

Never:

- store user private keys;
- expose signing secrets;
- trust client-provided verification results;
- trust arbitrary callback data;
- allow client to mark a job verified;
- allow arbitrary settlement destinations.

## Verification engine

Treat external evidence as untrusted input.

Use:

- schema validation;
- URL allowlists where appropriate;
- timeouts;
- request size limits;
- SSRF protections;
- no unrestricted internal-network access;
- deterministic parsing.

---

# 24. Failure Handling

The demo must remain understandable if something breaks.

## Provider unavailable

Result:

```text
VERIFICATION FAILED
Reason: provider unavailable
```

Then follow the configured failure/expiry policy.

## Malformed response

Result:

```text
VERIFICATION FAILED
Reason: invalid JSON
```

## Timeout

Result:

```text
VERIFICATION FAILED
Reason: delivery exceeded deadline
```

## Blockchain transaction failure

Do NOT mark the job settled.

Keep status:

```text
SETTLEMENT_PENDING / SETTLEMENT_FAILED
```

Allow retry if safe.

---

# 25. External Setup Required

The coding agent should identify and document exact values needed.

Likely requirements:

## Solana

- Solana CLI
- Anchor CLI
- Rust
- wallet/keypair
- Devnet SOL
- Devnet USDC

## Backend

- Node.js 20+
- package manager
- Supabase/Postgres credentials if used

## AI

Optional API key for natural-language condition generation.

The product MUST still work without an LLM.

## x402

If the integration is implemented:

- facilitator endpoint;
- supported network/scheme;
- test credentials if required.

## Deployment

Potential:

- Vercel for frontend;
- Railway/Render/Fly.io or equivalent for backend if required;
- Supabase for database.

The coding agent should prefer the fewest external services possible.

---

# 26. Environment Variables

Use a `.env.example`.

Suggested:

```text
NEXT_PUBLIC_SOLANA_NETWORK=devnet
NEXT_PUBLIC_PROGRAM_ID=
NEXT_PUBLIC_USDC_MINT=

SOLANA_RPC_URL=
SOLANA_PAYER_PRIVATE_KEY=

DATABASE_URL=

VERIFIER_BASE_URL=

MCP_SERVER_URL=

AI_PROVIDER_API_KEY=

X402_FACILITATOR_URL=
```

Never commit real secrets.

---

# 27. Suggested Repository Structure

```text
observator/
│
├── apps/
│   ├── web/
│   │   ├── app/
│   │   ├── components/
│   │   ├── lib/
│   │   └── ...
│   │
│   ├── api/
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   ├── services/
│   │   │   ├── verification/
│   │   │   ├── settlement/
│   │   │   └── index.ts
│   │   └── ...
│   │
│   └── mcp/
│       ├── src/
│       │   ├── tools/
│       │   └── index.ts
│       └── ...
│
├── programs/
│   └── observator-escrow/
│       └── src/
│
├── tests/
│   ├── escrow/
│   ├── verification/
│   └── integration/
│
├── demo/
│   └── provider/
│
├── docs/
│   ├── architecture.md
│   ├── verification-spec.md
│   └── demo-script.md
│
├── Anchor.toml
├── package.json
├── pnpm-workspace.yaml
├── .env.example
└── README.md
```

The coding agent may simplify this structure if a monorepo creates unnecessary friction.

---

# 28. API Contracts

## Create Job

`POST /api/jobs`

```json
{
  "providerUrl": "https://example.com/data",
  "providerAddress": "...",
  "amount": "100000",
  "mint": "...",
  "deadline": "2026-09-24T15:00:00Z",
  "conditions": [
    {
      "type": "http_status",
      "expected": 200
    },
    {
      "type": "required_fields",
      "fields": ["symbol", "price", "timestamp"]
    },
    {
      "type": "max_age_seconds",
      "field": "timestamp",
      "max": 60
    }
  ]
}
```

Response:

```json
{
  "jobId": "...",
  "escrowAddress": "...",
  "status": "CREATED"
}
```

## Submit Delivery

`POST /api/jobs/:id/delivery`

```json
{
  "evidenceUrl": "...",
  "metadata": {}
}
```

## Verify

`POST /api/jobs/:id/verify`

Response:

```json
{
  "jobId": "...",
  "status": "PASSED",
  "checks": []
}
```

## Settle

`POST /api/jobs/:id/settle`

The server MUST independently confirm the job is eligible for settlement.

Never trust:

```json
{
  "verified": true
}
```

from a browser.

---

# 29. Verification Specification

Represent conditions as a discriminated union.

Example:

```ts
type Condition =
  | {
      type: "http_status";
      expected: number;
    }
  | {
      type: "required_fields";
      fields: string[];
    }
  | {
      type: "json_schema";
      schema: Record<string, unknown>;
    }
  | {
      type: "max_age_seconds";
      field: string;
      max: number;
    }
  | {
      type: "max_latency_ms";
      max: number;
    };
```

Every condition must have:

```ts
{
  type,
  config,
  result,
  evidence
}
```

---

# 30. Test Requirements

## Smart contract

Minimum:

- initialize escrow;
- fund escrow;
- release;
- refund;
- expiry;
- unauthorized release fails;
- unauthorized refund fails;
- double settlement fails;
- wrong amount fails;
- wrong recipient fails.

## Verification engine

Minimum:

- valid response passes;
- malformed JSON fails;
- missing field fails;
- stale timestamp fails;
- fresh timestamp passes;
- timeout fails;
- deadline failure works.

## Integration

Minimum:

1. create job;
2. fund escrow;
3. submit valid delivery;
4. verify;
5. release;
6. create second job;
7. submit invalid delivery;
8. verify;
9. refund.

---

# 31. Build Order

The coding agent MUST NOT start by polishing the frontend.

Build in this order:

## Phase 1 — Repository and environment

- inspect repository;
- establish monorepo;
- install dependencies;
- configure TypeScript;
- configure Anchor;
- configure environment;
- create README.

## Phase 2 — Solana escrow

Build and test:

- initialize;
- fund;
- release;
- refund;
- expiry;
- access control.

Do not proceed until tests pass.

## Phase 3 — Verification engine

Build deterministic checks.

Test independently.

## Phase 4 — Backend orchestration

Connect:

```text
Job
→ escrow
→ delivery
→ verification
→ settlement
```

## Phase 5 — Demo provider

Create good/bad responses.

## Phase 6 — Frontend

Build the dashboard around the already-working workflow.

## Phase 7 — MCP

Expose core functionality.

## Phase 8 — x402 integration

Integrate only after the core workflow works.

## Phase 9 — Hardening

Run attack/failure tests.

## Phase 10 — Demo polish

Only now improve visuals, animations, copy, and presentation.

---

# 32. 14-Day Schedule

## Day 1

- repo setup;
- architecture;
- environment;
- Anchor skeleton.

## Day 2

- escrow state/account design;
- initialization;
- funding.

## Day 3

- release;
- refund;
- expiry;
- security tests.

## Day 4

- verification engine;
- condition schema.

## Day 5

- all V1 verification checks;
- verification tests.

## Day 6

- backend job lifecycle.

## Day 7

- full backend integration.

## Day 8

- demo provider;
- successful and failed flows.

## Day 9

- frontend dashboard.

## Day 10

- frontend job creation and verification UI.

## Day 11

- MCP server.

## Day 12

- x402 integration if stable.

## Day 13

- security hardening;
- end-to-end testing;
- deployment.

## Day 14

- demo recording;
- submission assets;
- README;
- final cleanup.

If behind schedule, cut in this order:

1. fancy animations;
2. AI condition generation;
3. x402 integration depth;
4. MCP polish;
5. analytics.

NEVER cut:

- escrow;
- deterministic verification;
- release/refund;
- successful end-to-end demo;
- failed end-to-end demo.

---

# 33. Judge-Proofing

Different judges will attack the project differently.

## The skeptical judge

Question:

> "Isn't escrow already solved?"

Answer:

> "Yes. We're not claiming escrow is new. The product is the verification-to-settlement layer: the buyer defines machine-verifiable service conditions, the verifier produces evidence, and the escrow program enforces the resulting settlement."

## The technical judge

Question:

> "Why trust your verifier?"

Answer:

> "V1 deliberately limits verification to deterministic checks. The verifier cannot directly rewrite escrow state. It can only invoke the program's authorized settlement path when the backend's verification record satisfies the contract."

## The AI judge

Question:

> "Where is AI?"

Answer:

> "Agents are first-class clients through MCP, and AI can translate natural-language requirements into machine-readable conditions. But the final settlement decision is deterministic. We don't ask an LLM to control money."

## The blockchain judge

Question:

> "Why does this need Solana?"

Answer:

> "The settlement primitive is on-chain. Low transaction cost and fast finality make frequent small-value conditional settlement practical for machine-to-machine services."

## The product judge

Question:

> "Who needs this?"

Answer:

> "Developers building autonomous agents that purchase APIs, data, compute, or other machine-delivered services. V1 demonstrates the API/data case."

## The scalability judge

Question:

> "Is this just one API escrow?"

Answer:

> "No. The core abstraction is Job + Conditions + Evidence + Verification + Settlement. New verifier adapters can support new service categories without replacing the escrow layer."

## The competitor judge

Question:

> "What stops x402, a wallet provider, or an escrow project from adding this?"

Answer:

> "Nothing guarantees they cannot. Our strategy is not to claim an impossible moat. The initial wedge is a focused developer-facing verification/settlement layer that integrates with existing rails. The moat, if validated, comes from verification adapters, historical outcome data, developer integrations, and becoming the settlement policy layer rather than another payment rail."

This answer is more credible than claiming incumbents cannot copy us.

---

# 34. What We Must NOT Claim

Never say:

- "Nobody else is doing this."
- "We invented conditional payments."
- "AI can perfectly judge service quality."
- "This guarantees fraud-free agent commerce."
- "This is production-ready financial infrastructure."
- "Our competitors cannot copy us."
- "Every agent will need this."
- "x402 is broken."

Instead:

- "We add a conditional settlement primitive."
- "Our V1 focuses on machine-verifiable service conditions."
- "We integrate with existing payment infrastructure."
- "The prototype demonstrates a concrete settlement workflow."
- "The long-term opportunity is broader than the V1."

---

# 35. Definition of Done

Observator is ready for submission when all of these are true:

### Core

- [ ] User can create a conditional job.
- [ ] Funds can be locked in Solana escrow.
- [ ] Provider can submit delivery.
- [ ] Verification engine evaluates conditions.
- [ ] Passing delivery releases funds.
- [ ] Failing/expired delivery refunds funds.
- [ ] Transactions are visible.

### Security

- [ ] Unauthorized settlement fails.
- [ ] Double settlement fails.
- [ ] Invalid state transitions fail.
- [ ] Secrets are not committed.
- [ ] Verification result cannot be forged from the frontend.

### Demo

- [ ] Good path works end-to-end.
- [ ] Bad path works end-to-end.
- [ ] Both show real Solana transactions.
- [ ] Dashboard clearly explains what happened.

### Agent interface

- [ ] MCP server exposes core operations.
- [ ] An MCP-capable client can interact with Observator.

### Presentation

- [ ] One-sentence explanation is clear.
- [ ] Problem is shown before solution.
- [ ] Demo is understandable without technical background.
- [ ] README explains architecture.
- [ ] Repository is clean.

---

# 36. Submission Narrative

## Problem

Autonomous agents can increasingly discover and pay for internet-native services. But payment and delivery verification remain separate concerns.

A human can inspect a result and decide whether it was acceptable.

An autonomous agent needs an executable settlement policy.

## Solution

Observator lets a buyer define machine-verifiable delivery conditions and locks payment in Solana escrow.

When the provider delivers, Observator evaluates the conditions.

Passing conditions release payment.

Failed or expired conditions trigger the configured refund path.

## Why now

Agentic payments are becoming more practical through protocols such as x402.

The next problem is not only:

> "How does an agent pay?"

It is:

> "How does an agent safely settle a purchase when delivery has conditions?"

## Why Solana

Solana provides the low-cost, fast settlement layer required for frequent small-value machine-to-machine transactions.

## Future

Observator can expand from API verification into:

- data verification;
- file verification;
- computation verification;
- on-chain state verification;
- milestones;
- dispute evidence;
- reputation;
- multi-provider procurement.

---

# 37. Technical Documentation References

Use current official documentation during implementation.

- Solana x402: https://solana.com/docs/payments/agentic-payments/x402
- Solana x402 overview: https://solana.com/x402
- Solana x402 facilitator: https://solana.com/docs/tools/x402-facilitator
- x402 Foundation: https://x402.org/
- Anchor: https://www.anchor-lang.com/docs
- Anchor local development: https://www.anchor-lang.com/docs/quickstart/local
- MCP TypeScript SDK: https://ts.sdk.modelcontextprotocol.io/v2/
- MCP first server: https://ts.sdk.modelcontextprotocol.io/v2/get-started/first-server

Implementation rule:

> When current SDK behavior conflicts with this document, follow the current official documentation and update the implementation notes rather than forcing an outdated API.

---

# 38. Coding-Agent Master Instruction

The following section is intended to be handed directly to the coding agent.

---

## ROLE

You are the senior full-stack Solana engineer responsible for implementing Observator.

You must behave as:

- Solana/Anchor engineer;
- TypeScript backend engineer;
- verification-engine engineer;
- frontend engineer;
- MCP integration engineer;
- security reviewer;
- test engineer.

The human is the product owner.

Do not make unnecessary architectural decisions silently.

When a decision materially changes the product or creates significant scope, explain it briefly and choose the smallest viable option.

---

## PRIMARY OBJECTIVE

Build a working hackathon-quality prototype of Observator:

> A conditional settlement layer where funds are locked in Solana escrow and released only when machine-verifiable delivery conditions pass.

The end-to-end workflow is the highest priority.

---

## NON-NEGOTIABLE PRODUCT BEHAVIOR

Implement:

1. create conditional job;
2. fund escrow;
3. provider delivery;
4. deterministic verification;
5. successful release;
6. failed/expired refund;
7. dashboard visibility;
8. real Solana Devnet transactions;
9. MCP interface;
10. x402 integration if it can be implemented without destabilizing the core.

---

## ENGINEERING RULES

### Rule 1

Do not build unnecessary infrastructure.

### Rule 2

Do not replace deterministic verification with an LLM.

### Rule 3

Do not store private user keys.

### Rule 4

Do not allow the browser to directly decide settlement.

### Rule 5

Do not claim security properties that have not been tested.

### Rule 6

Prefer official SDKs and current documentation.

### Rule 7

Use the smallest number of external services possible.

### Rule 8

Write tests before declaring core functionality complete.

### Rule 9

Keep the code understandable enough for the product owner to explain during judging.

### Rule 10

If an implementation becomes a major blocker, simplify the feature rather than expanding scope.

---

# 39. First Actions for the Coding Agent

Before writing significant code:

1. Inspect the repository.
2. Determine whether an existing application exists.
3. Preserve useful existing code where appropriate.
4. Check Node/Rust/Anchor versions.
5. Establish the project structure.
6. Create or update:
   - README;
   - `.env.example`;
   - architecture notes;
   - implementation checklist.
7. Confirm the Solana Devnet workflow.
8. Build the escrow program first.
9. Test the escrow program before building UI.

Do not start with the landing page.

---

# 40. Required Build Checkpoints

After each checkpoint, stop and report:

## Checkpoint A

Repository and environment working.

## Checkpoint B

Escrow program deployed to Devnet and tests passing.

## Checkpoint C

Verification engine passing unit tests.

## Checkpoint D

Backend can run complete workflow.

## Checkpoint E

Frontend can execute the workflow.

## Checkpoint F

MCP integration works.

## Checkpoint G

x402 integration works, or a documented reason it was deferred.

## Checkpoint H

Full successful and failed demos work from a clean environment.

---

# 41. Final Architecture Principle

The architecture should make this statement true:

> **Observator does not decide whether a service is valuable. It enforces an agreement that the buyer and provider have already expressed in machine-verifiable terms.**

That is the core product.

Build that exceptionally well.

Everything else is secondary.
