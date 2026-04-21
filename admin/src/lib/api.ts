import type { EditableConfigPayload } from "./types";

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  return (text ? JSON.parse(text) : {}) as T;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    ...init,
  });

  if (!response.ok) {
    const errorBody = await parseJson<{ error?: string; details?: unknown }>(response).catch(() => null);
    const message = errorBody?.error || `Request failed with ${response.status}`;
    throw new Error(message);
  }

  return parseJson<T>(response);
}

export function fetchConfig(): Promise<EditableConfigPayload> {
  return request<EditableConfigPayload>("/api/admin/config", { method: "GET" });
}

export function saveConfig(payload: EditableConfigPayload): Promise<{ ok: true; config: EditableConfigPayload; savedAt: string }> {
  return request("/api/admin/config", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function logout(): Promise<void> {
  await fetch("/api/admin/logout", {
    method: "POST",
    credentials: "include",
  });
}
