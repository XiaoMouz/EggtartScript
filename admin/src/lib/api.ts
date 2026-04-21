import type { EditableConfigPayload, SubscriptionMetadataSnapshot } from "./types";

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

function parseSubscriptionUserInfo(value: string | null): Pick<
  SubscriptionMetadataSnapshot,
  "rawUserInfo" | "uploadBytes" | "downloadBytes" | "totalBytes" | "expireAt"
> {
  if (!value) {
    return {
      rawUserInfo: null,
      uploadBytes: null,
      downloadBytes: null,
      totalBytes: null,
      expireAt: null,
    };
  }

  const fields = Object.fromEntries(
    value
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [key, raw] = part.split("=", 2);
        return [key?.trim().toLowerCase() || "", raw?.trim() || ""];
      }),
  );

  const parseNumber = (key: string): number | null => {
    const raw = fields[key];
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  };

  return {
    rawUserInfo: value,
    uploadBytes: parseNumber("upload"),
    downloadBytes: parseNumber("download"),
    totalBytes: parseNumber("total") ?? parseNumber("totl"),
    expireAt: parseNumber("expire"),
  };
}

export async function fetchSubscriptionMetadata(accessToken: string): Promise<SubscriptionMetadataSnapshot> {
  const response = await fetch(`/sub/${encodeURIComponent(accessToken)}`, {
    method: "HEAD",
    credentials: "include",
  });

  if (!response.ok) {
    let message = `Request failed with ${response.status}`;
    try {
      const errorBody = await parseJson<{ error?: string }>(response);
      if (errorBody.error) {
        message = errorBody.error;
      }
    } catch {
      // Ignore non-JSON error bodies.
    }
    throw new Error(message);
  }

  const userInfo = parseSubscriptionUserInfo(response.headers.get("subscription-userinfo"));
  return {
    profileTitle: "小莫的蛋挞云",
    // prifileTitle: response.headers.get("profile-title"),
    contentDisposition: response.headers.get("content-disposition"),
    profileUpdateInterval: response.headers.get("profile-update-interval"),
    ...userInfo,
  };
}
