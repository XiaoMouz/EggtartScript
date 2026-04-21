import type { Env, HttpError, UpstreamConfig } from "./types.ts";

const DEFAULT_BASE_URL = "https://eggtart.pro/api/v1";
const DEFAULT_CLASH_USER_AGENT = "clash";
const DEFAULT_TIMEOUT_MS = 15000;

export function createHttpError(message: string, status = 500, details?: unknown): HttpError {
  const error = new Error(message) as HttpError;
  error.status = status;
  error.details = details;
  return error;
}

export function requireTrimmedString(
  env: object | undefined,
  key: string,
  message = `Missing required environment variable: ${key}`,
): string {
  const value = env ? Reflect.get(env, key) : undefined;
  if (typeof value !== "string" || value.trim() === "") {
    throw createHttpError(message, 500);
  }
  return value.trim();
}

function readTimeout(env: Env): number {
  const raw = env.REQUEST_TIMEOUT_MS;
  if (raw == null || raw === "") {
    return DEFAULT_TIMEOUT_MS;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw createHttpError("REQUEST_TIMEOUT_MS must be a positive number", 500);
  }
  return parsed;
}

export function loadEnvConfig(env: Env): UpstreamConfig {
  return {
    eggtartEmail: requireTrimmedString(env, "EGGTART_EMAIL"),
    eggtartPassword: requireTrimmedString(env, "EGGTART_PASSWORD"),
    baseUrl: (env.EGGTART_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ""),
    clashUserAgent: (env.CLASH_USER_AGENT || DEFAULT_CLASH_USER_AGENT).trim(),
    requestTimeoutMs: readTimeout(env),
  };
}
