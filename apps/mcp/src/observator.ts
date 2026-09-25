// Backend HTTP client for the MCP server (Node side).
// The MCP server is an interface into Observator, not the escrow itself (spec §12).
const base = () => process.env.OBSERVATOR_API_URL ?? "http://localhost:3001";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base()}${path}`, {
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

export interface CreatedJob {
  jobId: string;
  escrowAddress: string | null;
  status: string;
}

export const backend = {
  createJob: (payload: Record<string, unknown>) =>
    call<CreatedJob>("/api/jobs", { method: "POST", body: JSON.stringify(payload) }),
  getJob: (id: string) => call<Record<string, unknown>>(`/api/jobs/${id}`),
  deliver: (id: string, evidenceUrl: string, metadata: Record<string, unknown> = {}) =>
    call(`/api/jobs/${id}/delivery`, {
      method: "POST",
      body: JSON.stringify({ evidenceUrl, metadata }),
    }),
  verify: (id: string) =>
    call<{ jobId: string; status: string; checks: unknown[] }>(`/api/jobs/${id}/verify`, {
      method: "POST",
      body: "{}",
    }),
  settle: (id: string) =>
    call<{ action: string; status: string; signature: string | null }>(
      `/api/jobs/${id}/settle`,
      { method: "POST", body: "{}" },
    ),
};
