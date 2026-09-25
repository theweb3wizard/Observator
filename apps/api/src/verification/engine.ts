// Deterministic verification engine — Observator V1.
// Spec §§9-10, 23-24. NOT an AI judge: executes the buyer-defined
// conditions against fetched evidence and returns pass/fail + evidence.
// External evidence is untrusted input: URL policy, DNS allowlisting,
// timeouts, size caps, manual redirect handling.
import { lookup } from "node:dns/promises";
import { Ajv } from "ajv";
import { Condition, ConditionSchema } from "./conditions.js";

export type CheckStatus = "PASS" | "FAIL";
export type OverallStatus = "PASS" | "FAIL";

export interface CheckResult {
  type: string;
  status: CheckStatus;
  [key: string]: unknown;
}

export interface VerificationReport {
  jobId: string;
  overall: OverallStatus;
  checks: CheckResult[];
  verifiedAt: string;
  deliveredAt: string;
  deadline: string;
  latencyMs: number;
  httpStatus: number | null;
}

export interface VerifyOptions {
  jobId: string;
  evidenceUrl: string;
  /** Raw conditions from the job record; re-validated here (never trusted). */
  conditions: unknown[];
  deadlineIso: string;
  timeoutMs?: number;
  maxBytes?: number;
  /** Tests set true for 127.0.0.1. Production MUST leave false. */
  allowPrivateHosts?: boolean;
  /** Injectable clock (ms since epoch) for deterministic tests. */
  nowMs?: () => number;
}

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_BYTES = 256 * 1024;
const MAX_REDIRECTS = 3;

const ajv = new Ajv({ allErrors: true, strict: false });

function isPrivateIp(ip: string): boolean {
  if (ip === "::1" || ip === "::") return true;
  if (ip.includes(":")) {
    const lower = ip.toLowerCase();
    return (
      lower.startsWith("fe80:") ||
      lower.startsWith("fc") ||
      lower.startsWith("fd")
    );
  }
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255))
    return true; // fail closed on unparseable
  const [a, b] = parts;
  if (a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a === 0 || a >= 224) return true;
  return false;
}

async function assertSafeUrl(raw: string, allowPrivateHosts: boolean): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("invalid_url");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("url_not_http");
  if (url.username !== "" || url.password !== "") throw new Error("url_has_credentials");
  if (!allowPrivateHosts) {
    let ips: string[];
    try {
      ips = (await lookup(url.hostname, { all: true })).map((r) => r.address);
    } catch {
      throw new Error("dns_lookup_failed");
    }
    if (ips.length === 0 || ips.some(isPrivateIp)) throw new Error("url_resolves_to_private");
    if (isPrivateIp(url.hostname)) throw new Error("url_is_private_ip");
  }
  return url;
}

/** Parse a timestamp field: epoch seconds, epoch ms, or ISO/date string. Returns ms or null. */
export function parseTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 1e14 || value < -1e14) return null;
    const ms = value < 1e11 ? value * 1000 : value; // s vs ms heuristic
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === "string") {
    const t = Date.parse(value);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

function getTopLevel(data: unknown, field: string): unknown {
  if (typeof data === "object" && data !== null && field in (data as Record<string, unknown>)) {
    return (data as Record<string, unknown>)[field];
  }
  return undefined;
}

export async function verifyDelivery(opts: VerifyOptions): Promise<VerificationReport> {
  const now = opts.nowMs ?? Date.now;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const conditions: Condition[] = ConditionSchema.array().parse(opts.conditions);
  const deadlineMs = Date.parse(opts.deadlineIso);

  const failReport = (checks: CheckResult[]): VerificationReport => {
    const t = now();
    return {
      jobId: opts.jobId,
      overall: "FAIL",
      checks,
      verifiedAt: new Date(t).toISOString(),
      deliveredAt: new Date(t).toISOString(),
      deadline: opts.deadlineIso,
      latencyMs: -1,
      httpStatus: null,
    };
  };

  if (Number.isNaN(deadlineMs)) {
    return failReport([{ type: "config", status: "FAIL", reason: "invalid_deadline" }]);
  }

  // --- Fetch evidence with guards ---
  let httpStatus: number | null = null;
  let rawText = "";
  let latencyMs = -1;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const t0 = Date.now();
    try {
      let current = (await assertSafeUrl(opts.evidenceUrl, opts.allowPrivateHosts ?? false)).toString();
      let res: Response | null = null;
      for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        res = await fetch(current, { redirect: "manual", signal: controller.signal });
        if (res.status >= 300 && res.status < 400) {
          const loc = res.headers.get("location");
          if (!loc || hop === MAX_REDIRECTS) throw new Error("redirect_failed");
          current = (await assertSafeUrl(new URL(loc, current).toString(), opts.allowPrivateHosts ?? false)).toString();
          continue;
        }
        break;
      }
      if (!res) throw new Error("no_response");
      httpStatus = res.status;
      if (!res.body) throw new Error("empty_body");
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.length;
        if (received > maxBytes) {
          await reader.cancel().catch(() => undefined);
          throw new Error("response_too_large");
        }
        chunks.push(value);
      }
      const merged = new Uint8Array(received);
      let off = 0;
      for (const c of chunks) {
        merged.set(c, off);
        off += c.length;
      }
      rawText = new TextDecoder("utf-8", { fatal: false }).decode(merged);
    } finally {
      latencyMs = Date.now() - t0;
      clearTimeout(timer);
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : "fetch_failed";
    return failReport([{ type: "fetch", status: "FAIL", reason }]);
  }

  const deliveredAtMs = now();
  const checks: CheckResult[] = [];

  // --- Parse ---
  let data: unknown = null;
  let jsonValid = false;
  try {
    data = JSON.parse(rawText);
    jsonValid = true;
  } catch {
    jsonValid = false;
  }
  checks.push({
    type: "json_valid",
    status: jsonValid ? "PASS" : "FAIL",
    ...(jsonValid ? {} : { reason: "invalid_json" }),
  });

  // --- Configured conditions ---
  for (const c of conditions) {
    switch (c.type) {
      case "http_status":
        checks.push({
          type: "http_status",
          status: httpStatus === c.expected ? "PASS" : "FAIL",
          expected: c.expected,
          actual: httpStatus,
        });
        break;
      case "required_fields": {
        const missing = !jsonValid || typeof data !== "object" || data === null
          ? [...c.fields]
          : c.fields.filter((f) => getTopLevel(data, f) === undefined);
        checks.push({
          type: "required_fields",
          status: missing.length === 0 ? "PASS" : "FAIL",
          required: c.fields,
          missing,
        });
        break;
      }
      case "json_schema": {
        if (!jsonValid) {
          checks.push({ type: "json_schema", status: "FAIL", reason: "invalid_json" });
          break;
        }
        let valid = false;
        let errors: unknown = null;
        try {
          const validate = ajv.compile(c.schema);
          valid = validate(data) as boolean;
          errors = validate.errors ?? null;
        } catch (e) {
          errors = e instanceof Error ? e.message : "schema_error";
        }
        checks.push({
          type: "json_schema",
          status: valid ? "PASS" : "FAIL",
          ...(valid ? {} : { errors }),
        });
        break;
      }
      case "max_age_seconds": {
        const raw = getTopLevel(data, c.field);
        const ts = raw === undefined ? null : parseTimestamp(raw);
        const ageSeconds = ts === null ? null : Math.max(0, (deliveredAtMs - ts) / 1000);
        const pass = ageSeconds !== null && ageSeconds <= c.max;
        checks.push({
          type: "freshness",
          status: pass ? "PASS" : "FAIL",
          field: c.field,
          ageSeconds,
          maxAgeSeconds: c.max,
          ...(pass ? {} : { reason: ts === null ? "unparseable_timestamp" : "stale_timestamp" }),
        });
        break;
      }
      case "max_latency_ms":
        checks.push({
          type: "max_latency_ms",
          status: latencyMs <= c.max ? "PASS" : "FAIL",
          latencyMs,
          maxLatencyMs: c.max,
        });
        break;
    }
  }

  // --- Deadline (Check E, always evaluated) ---
  const lateByMs = Math.max(0, deliveredAtMs - deadlineMs);
  checks.push({
    type: "deadline",
    status: deliveredAtMs <= deadlineMs ? "PASS" : "FAIL",
    deliveredAt: new Date(deliveredAtMs).toISOString(),
    deadline: opts.deadlineIso,
    lateByMs,
  });

  const overall: OverallStatus = checks.every((c) => c.status === "PASS") ? "PASS" : "FAIL";
  return {
    jobId: opts.jobId,
    overall,
    checks,
    verifiedAt: new Date(now()).toISOString(),
    deliveredAt: new Date(deliveredAtMs).toISOString(),
    deadline: opts.deadlineIso,
    latencyMs,
    httpStatus,
  };
}
