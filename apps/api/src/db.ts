// Store — Observator V1 backend persistence (spec §15 tables).
// Two drivers behind one async interface; routes never touch a driver:
// - SQLite (node:sqlite, zero deps): local dev, `:memory:` tests.
// - Postgres (`pg`): Neon cloud DB when DATABASE_URL is a postgres URL.
// Table/column names are identical in both; SQL is written with `?`
// placeholders and translated to `$n` for Postgres.
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Client } from "pg";

export interface Store {
  get<T>(sql: string, ...params: unknown[]): Promise<T | undefined>;
  all<T>(sql: string, ...params: unknown[]): Promise<T[]>;
  run(sql: string, ...params: unknown[]): Promise<{ changes: number }>;
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  close(): Promise<void>;
}

/** @deprecated Use openStore + Store. Kept for type compatibility. */
export type Db = Store;

const SQLITE_SCHEMA = `
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

const PG_SCHEMA = `
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
  id SERIAL PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  type TEXT NOT NULL,
  config_json TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS deliveries (
  id SERIAL PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  evidence_url TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS verification_runs (
  id SERIAL PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  status TEXT NOT NULL,
  results_json TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settlements (
  id SERIAL PRIMARY KEY,
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

class SqliteStore implements Store {
  private db: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec(SQLITE_SCHEMA);
  }
  async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
    return this.db.prepare(sql).get(...(params as SQLInputValue[])) as T | undefined;
  }
  async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    return this.db.prepare(sql).all(...(params as SQLInputValue[])) as T[];
  }
  async run(sql: string, ...params: unknown[]): Promise<{ changes: number }> {
    const info = this.db.prepare(sql).run(...(params as SQLInputValue[]));
    return { changes: Number(info.changes) };
  }
  async begin(): Promise<void> {
    this.db.exec("BEGIN");
  }
  async commit(): Promise<void> {
    this.db.exec("COMMIT");
  }
  async rollback(): Promise<void> {
    try {
      this.db.exec("ROLLBACK");
    } catch {
      /* no active transaction */
    }
  }
  async close(): Promise<void> {
    this.db.close();
  }
}

function toPg(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

class PgStore implements Store {
  private client: Client;
  private constructor(client: Client) {
    this.client = client;
  }
  static async connect(url: string): Promise<PgStore> {
    // Single long-lived client (not a pool): keeps BEGIN/COMMIT on one
    // connection. Correct for single-instance hackathon scale; revisit with
    // a pool + per-transaction clients if this ever serves real traffic.
    const client = new Client({ connectionString: url });
    await client.connect();
    await client.query(PG_SCHEMA);
    return new PgStore(client);
  }
  async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
    const res = await this.client.query(toPg(sql), [...params]);
    return (res.rows[0] as T | undefined) ?? undefined;
  }
  async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    const res = await this.client.query(toPg(sql), [...params]);
    return res.rows as T[];
  }
  async run(sql: string, ...params: unknown[]): Promise<{ changes: number }> {
    const res = await this.client.query(toPg(sql), [...params]);
    return { changes: res.rowCount ?? 0 };
  }
  async begin(): Promise<void> {
    await this.client.query("BEGIN");
  }
  async commit(): Promise<void> {
    await this.client.query("COMMIT");
  }
  async rollback(): Promise<void> {
    try {
      await this.client.query("ROLLBACK");
    } catch {
      /* no active transaction */
    }
  }
  async close(): Promise<void> {
    await this.client.end();
  }
}

export function isPostgresUrl(value: string): boolean {
  return /^postgres(ql)?:\/\//.test(value);
}

export async function openStore(target: string = defaultDbPath()): Promise<Store> {
  if (isPostgresUrl(target)) return PgStore.connect(target);
  return new SqliteStore(target);
}

/** @deprecated Use openStore. Kept during migration; throws for pg URLs. */
export function openDb(path: string): DatabaseSync {
  if (isPostgresUrl(path)) throw new Error("openDb is sqlite-only; use openStore");
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SQLITE_SCHEMA);
  return db;
}

export function defaultDbPath(): string {
  return process.env.DATABASE_URL ?? "./data/observator.db";
}
