// Demo provider — Observator V1 fake-but-real HTTP service (spec §17)
// with the Phase 8 x402 adapter (spec §13): the data endpoints can require
// an x402 payment (Solana devnet, exact scheme) via the official SDK.
// Layering is deliberate and honest:
//   x402  = payment rail for data access ($0.001 micropayment to provider)
//   escrow = conditional settlement for the job ($0.10 released iff checks pass)
// Modes:
//   X402_ENABLED=0 (default): /good + /bad open — E2E + tests unaffected.
//   X402_ENABLED=1: /good + /bad return 402 without a valid PAYMENT-SIGNATURE,
//                   verified/settled via the facilitator. /health stays open.
import Fastify from "fastify";
import { paymentMiddleware, x402ResourceServer } from "@x402/fastify";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactSvmScheme } from "@x402/svm/exact/server";

const PORT = Number(process.env.PORT ?? 3003);
const STALE_SECONDS = Number(process.env.STALE_SECONDS ?? 184);
const X402_ENABLED = process.env.X402_ENABLED === "1";
const FACILITATOR_URL = process.env.X402_FACILITATOR_URL ?? "https://x402.org/facilitator";
// Receiving wallet for the $0.001 data-access fee (provider's wallet in prod).
const PAY_TO = process.env.X402_PAY_TO ?? "4zMMC9srt5Ri5X14GAgXhaHii3Gn9VQTzRpWhq1FUD9";
const SOLANA_DEVNET = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";

function payload(staleBySeconds: number) {
  const nowMs = Date.now();
  return {
    symbol: "BTC",
    price: 112000 + Math.floor(nowMs / 1000) % 50,
    timestamp: Math.floor((nowMs - staleBySeconds * 1000) / 1000), // epoch seconds
  };
}

const app = Fastify({ logger: false });

if (X402_ENABLED) {
  const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
  const server = new x402ResourceServer(facilitator).register(
    SOLANA_DEVNET,
    new ExactSvmScheme(),
  );
  const price = process.env.X402_PRICE ?? "$0.001";
  paymentMiddleware(
    app,
    {
      "GET /good": {
        accepts: [{ scheme: "exact", price, network: SOLANA_DEVNET, payTo: PAY_TO }],
        description: "Fresh BTC market data (Observator demo provider)",
        mimeType: "application/json",
      },
      "GET /bad": {
        accepts: [{ scheme: "exact", price, network: SOLANA_DEVNET, payTo: PAY_TO }],
        description: "Stale BTC market data (Observator demo failure path)",
        mimeType: "application/json",
      },
    },
    server,
  );
}

app.get("/health", async () => ({ ok: true, service: "observator-demo-provider", x402: X402_ENABLED }));
app.get("/good", async () => payload(0));
app.get("/bad", async () => payload(STALE_SECONDS));

app.listen({ port: PORT, host: "0.0.0.0" }).then(() => {
  console.log(
    `demo-provider :${PORT} (/good fresh, /bad stale ${STALE_SECONDS}s, x402=${X402_ENABLED ? "on" : "off"})`,
  );
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
