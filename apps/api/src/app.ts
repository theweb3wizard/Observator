// App factory (importable by tests) + production boot.
import Fastify from "fastify";
import cors from "@fastify/cors";
import { openStore, defaultDbPath } from "./db.js";
import { registerJobRoutes } from "./routes/jobs.js";

export async function buildApp(dbPath: string = defaultDbPath()) {
  const app = Fastify({ logger: false });
  // Dev default: dashboard runs on a different origin (:3000 vs :3001).
  // Tighten ALLOWED_ORIGINS for any public deployment.
  await app.register(cors, {
    origin: process.env.ALLOWED_ORIGINS?.split(",") ?? true,
  });
  const store = await openStore(dbPath);
  app.get("/health", async () => ({ ok: true, service: "observator-api" }));
  registerJobRoutes(app, store);
  return { app, store };
}
