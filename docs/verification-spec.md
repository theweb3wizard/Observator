# Verification spec (Observator V1)

Source: spec §§9–10, 29.

## Condition union (discriminated)

```ts
type Condition =
  | { type: "http_status"; expected: number }
  | { type: "required_fields"; fields: string[] }
  | { type: "json_schema"; schema: Record<string, unknown> }
  | { type: "max_age_seconds"; field: string; max: number }
  | { type: "max_latency_ms"; max: number };
// deadline is evaluated from job config + delivery timestamps (Check E).
```

## Result format

```json
{
  "jobId": "job_123",
  "overall": "PASS",
  "checks": [
    { "type": "http_status", "status": "PASS", "expected": 200, "actual": 200 },
    { "type": "required_fields", "status": "PASS",
      "required": ["symbol", "price", "timestamp"], "missing": [] },
    { "type": "freshness", "status": "PASS", "ageSeconds": 12, "maxAgeSeconds": 60 }
  ],
  "verifiedAt": "..."
}
```

Every check emits `{ type, status, expected?, actual?, evidence }`.
`overall` is `PASS` iff every required check passes. Evidence renders in UI
(§10) and via `get_verification_report` (MCP).

## Engine rules

Deterministic only. No LLM in the decision path. External evidence is
untrusted: validate schema, enforce timeouts + size limits + URL policy.
