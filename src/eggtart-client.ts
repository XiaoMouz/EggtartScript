import type { FetchSubscriptionParams, HttpError } from "./types.ts";

function httpError(message: string, status = 502, details?: unknown): HttpError {
  const error = new Error(message) as HttpError;
  error.status = status;
  error.details = details;
  return error;
}

async function requestJson(url: string, init: RequestInit, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      throw httpError("Upstream returned invalid JSON", 502, { url, body: text.slice(0, 500) });
    }

    if (!response.ok) {
      throw httpError(`Upstream request failed: ${response.status}`, 502, { url, body: json });
    }

    return json;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw httpError("Upstream request timed out", 504, { url });
    }
    if ((error as HttpError)?.status) {
      throw error;
    }
    throw httpError("Failed to reach upstream API", 502, { url, reason: String(error) });
  } finally {
    clearTimeout(timeout);
  }
}

async function requestText(url: string, init: RequestInit, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    if (!response.ok) {
      throw httpError(`Upstream request failed: ${response.status}`, 502, { url, body: text.slice(0, 500) });
    }
    return text;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw httpError("Upstream request timed out", 504, { url });
    }
    if ((error as HttpError)?.status) {
      throw error;
    }
    throw httpError("Failed to fetch subscription", 502, { url, reason: String(error) });
  } finally {
    clearTimeout(timeout);
  }
}

function readStringField(candidates: unknown[], label: string, response: unknown): string {
  const value = candidates.find((candidate) => typeof candidate === "string" && candidate.trim() !== "");
  if (!value || typeof value !== "string") {
    throw httpError(`${label} missing`, 502, { response });
  }
  return value;
}

export async function fetchSubscriptionYaml({
  baseUrl,
  email,
  password,
  clashUserAgent,
  subscribeHeaders = {},
  timeoutMs,
}: FetchSubscriptionParams): Promise<{ yamlText: string; authData: string; subscribeUrl: string }> {
  const loginUrl = `${baseUrl}/passport/auth/login`;
  const subscribeInfoUrl = `${baseUrl}/user/getSubscribe`;
  const loginPayload = { email, password };

  const loginResponse = (await requestJson(
    loginUrl,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(loginPayload),
    },
    timeoutMs,
  )) as Record<string, any>;

  const authData = readStringField(
    [loginResponse?.data?.auth_data, loginResponse?.auth_data, loginResponse?.data?.token, loginResponse?.token],
    "Login response auth_data",
    loginResponse,
  );

  const subscribeResponse = (await requestJson(
    subscribeInfoUrl,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: authData,
      },
    },
    timeoutMs,
  )) as Record<string, any>;

  const subscribeUrl = readStringField(
    [subscribeResponse?.data?.subscribe_url, subscribeResponse?.data?.subscribeUrl, subscribeResponse?.subscribe_url],
    "Subscribe response subscribe_url",
    subscribeResponse,
  );

  const yamlText = await requestText(
    subscribeUrl,
    {
      method: "GET",
      headers: {
        ...subscribeHeaders,
        "User-Agent": clashUserAgent,
      },
    },
    timeoutMs,
  );

  return { yamlText, authData, subscribeUrl };
}
