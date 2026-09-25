// File-backed store — Observator V1 backend persistence.
// Spec §15 tables (jobs, conditions, deliveries, verification_runs,
// settlements), §"fewest external services": uses Node's built-in
// node:sqlite, no external DB required for the hackathon demo.
// Postgres/Supabase can replace this module later without touching routes:
// all access goes through the functions below.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type Db = DatabaseSync;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  buyer_address TEXT NOT NULL,
  provider_url TEXT NOT NULL,
  provider_address TEXT NOT NULL,
  escrow_address TEXT,
  amount TEXT NOT NULL,
  mint TEXT NOT NULL,
  status TEXT NOT NULL,
  deadline TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS conditions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  type TEXT NOT NULL,
  config_json TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  evidence_url TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS verification_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  status TEXT NOT NULL,
  results_json TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settlements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  action TEXT NOT NULL,
  signature TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conditions_job ON conditions(job_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_job ON deliveries(job_id);
CREATE INDEX IF NOT EXISTS idx_runs_job ON verification_runs(job_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_settlements_job ON settlements(job_id);
`;

export function openDb(path: string): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);
  return db;
}

export function defaultDbPath(): string {
  return process.env.DATABASE_URL ?? "./data/observator.db";
}
