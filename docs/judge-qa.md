# Judge Q&A (Observator V1)

Source: spec §33. Each answer states what is actually built — never more.

## "Isn't escrow already solved?"

"Yes — we're not claiming escrow is new. The product is the
verification-to-settlement layer: the buyer defines machine-verifiable service
conditions, the verifier produces evidence, and the escrow program enforces the
resulting settlement. You can see both outcomes live: 5/5 checks release
payment, one stale timestamp refunds it."

## "Why trust your verifier?"

"V1 deliberately limits verification to deterministic checks — HTTP status,
JSON shape, required fields, freshness, deadline, latency. The verifier cannot
rewrite escrow state; the backend only invokes the program's authorized
settlement path, and the dashboard shows every check's evidence. An LLM never
touches the money path: it may help draft conditions, but the engine executes
them."

## "Where is AI?"

"Agents are first-class clients through our MCP server — six tools covering the
whole lifecycle, demoed live. AI can translate natural-language requirements
into machine-readable conditions. But the settlement decision is deterministic.
We don't ask an LLM to control money."

## "Why does this need Solana?"

"The settlement primitive is on-chain: escrow state and release/refund events
live on Solana Devnet. Low fees and fast finality make frequent $0.10-scale
machine-to-machine settlement practical — that's the transaction profile this
product needs."

## "Who needs this?"

"Developers building autonomous agents that purchase APIs, data, compute, or
other machine-delivered services. V1 demonstrates the API/data case with a
real provider, real checks, and both settlement outcomes."

## "Is this just one API escrow?"

"No. The abstraction is Job + Conditions + Evidence + Verification +
Settlement. The escrow layer stays the same while new verifier adapters
(files, hashes, on-chain state, attestations) plug in. That interface is
already how the codebase is organized."

## "What stops x402, a wallet, or an escrow project from adding this?"

"Nothing guarantees they can't — we don't claim an impossible moat. Our wedge
is a focused verification/settlement layer that integrates with existing rails:
x402 is literally our payment-facing adapter. The defensibility, if validated,
comes from verification adapters, historical outcome data, and becoming the
settlement-policy layer rather than another payment rail."
