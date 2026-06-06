import type {
  Entity,
  Investigation,
  InvestigationCreate,
  StreamEvent,
} from "./types";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:8080";

const API = `${API_BASE}/api/v1`;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Investigations
// ---------------------------------------------------------------------------

export async function createInvestigation(
  payload: InvestigationCreate,
): Promise<Investigation> {
  return request<Investigation>("/investigations", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getInvestigation(id: string): Promise<Investigation> {
  return request<Investigation>(`/investigations/${id}`);
}

export async function listInvestigations(limit = 50): Promise<Investigation[]> {
  return request<Investigation[]>(`/investigations?limit=${limit}`);
}

export async function deleteInvestigation(id: string): Promise<void> {
  await request<{ deleted: string }>(`/investigations/${id}`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

export async function listEntities(limit = 50): Promise<Entity[]> {
  return request<Entity[]>(`/entities?limit=${limit}`);
}

export async function getEntity(id: string): Promise<Entity> {
  return request<Entity>(`/entities/${id}`);
}

export async function addEntityNote(
  entityId: string,
  content: string,
  author = "analyst",
): Promise<Entity> {
  return request<Entity>(`/entities/${entityId}/notes`, {
    method: "POST",
    body: JSON.stringify({ author, content }),
  });
}

// ---------------------------------------------------------------------------
// Watchlists
// ---------------------------------------------------------------------------

export async function getWatchlists(): Promise<WatchlistPattern[]> {
  return request<WatchlistPattern[]>("/watchlists");
}

export interface WatchlistPattern {
  pattern: string;
  keywords: string[];
  signal_type: string;
  severity: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

export interface SignalRow {
  id: string;
  entity_name: string;
  investigation_id: string;
  signal_type: string;
  severity: string;
  title: string;
  description: string;
  confidence: number;
  sources: string[];
  created_at: string;
}

export async function listAllSignals(limit = 200): Promise<SignalRow[]> {
  return request<SignalRow[]>(`/signals?limit=${limit}`);
}

// ---------------------------------------------------------------------------
// SSE stream
// ---------------------------------------------------------------------------

export function streamInvestigation(
  investigationId: string,
  onEvent: (event: StreamEvent) => void,
  onError?: (error: Error) => void,
): () => void {
  const source = new EventSource(`${API}/investigations/${investigationId}/stream`);

  const handlers: Array<[string, (e: MessageEvent) => void]> = [
    ["snapshot",                (e) => onEvent({ event: "snapshot",                data: JSON.parse(e.data) })],
    ["status",                  (e) => onEvent({ event: "status",                  data: JSON.parse(e.data) })],
    ["step",                    (e) => onEvent({ event: "step",                    data: JSON.parse(e.data) })],
    ["agent_text",              (e) => onEvent({ event: "agent_text",              data: JSON.parse(e.data) })],
    ["tool_call",               (e) => onEvent({ event: "tool_call",               data: JSON.parse(e.data) })],
    ["tool_result",             (e) => onEvent({ event: "tool_result",             data: JSON.parse(e.data) })],
    ["investigation_completed", (e) => onEvent({ event: "investigation_completed", data: JSON.parse(e.data) })],
    ["done",                    (e) => onEvent({ event: "done",                    data: JSON.parse(e.data) })],
    ["error",                   (e) => onEvent({ event: "error",                   data: JSON.parse(e.data) })],
  ];

  for (const [name, handler] of handlers) {
    source.addEventListener(name, handler as EventListener);
  }

  source.onerror = () => {
    onError?.(new Error("SSE connection error"));
    source.close();
  };

  return () => source.close();
}
