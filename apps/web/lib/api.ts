// Typed client for the Observator API (apps/api).
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
export const DEVNET_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3Gn9VQTzRpWhq1FUD9";
export const DEMO_PROVIDER =
  process.env.NEXT_PUBLIC_PROVIDER_URL ?? "http://localhost:3003";

export interface Check {
  type: string;
  status: "PASS" | "FAIL";
  [key: string]: unknown;
}

export interface Job {
  id: string;
  buyerAddress: string;
  providerUrl: string;
  providerAddress: string;
  escrowAddress: string | null;
  amount: string;
  mint: string;
  status: string;
  deadline: string;
  createdAt: string;
  updatedAt: string;
}

export interface JobDetail {
  job: Job;
  conditions: { type: string; config_json: string }[];
  deliveries: { evidence_url: string; submitted_at: string }[];
  verificationRuns: { status: string; results_json: string; completed_at: string }[];
  settlement: {
    action: string;
    signature: string | null;
    status: string;
    created_at: string;
  } | null;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    const msg =
      typeof body === "object" && body !== null && "error" in body
        ? String((body as { error: unknown }).error)
        : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return body as T;
}

export const api = {
  listJobs: () => req<{ jobs: Job[] }>("/api/jobs"),
  getJob: (id: string) => req<JobDetail>(`/api/jobs/${id}`),
  createJob: (payload: Record<string, unknown>) =>
    req<{ jobId: string; escrowAddress: string | null; status: string }>("/api/jobs", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deliver: (id: string, evidenceUrl: string) =>
    req(`/api/jobs/${id}/delivery`, {
      method: "POST",
      body: JSON.stringify({ evidenceUrl }),
    }),
  verify: (id: string) =>
    req<{ jobId: string; status: string; checks: Check[] }>(`/api/jobs/${id}/verify`, {
      method: "POST",
      body: "{}",
    }),
  settle: (id: string) =>
    req<{ action: string; status: string; signature: string | null }>(
      `/api/jobs/${id}/settle`,
      { method: "POST", body: "{}" },
    ),
};

export function formatUsdc(baseUnits: string): string {
  return (Number(BigInt(baseUnits)) / 1_000_000).toFixed(2);
}
