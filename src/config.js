const DEFAULT_BASE_URL = "https://eggtart.pro/api/v1";
const DEFAULT_CLASH_USER_AGENT = "clash";
const DEFAULT_TIMEOUT_MS = 15000;

function requireString(env, key) {
  const value = env?.[key];
  if (typeof value !== "string" || value.trim() === "") {
    const error = new Error(`Missing required environment variable: ${key}`);
    error.status = 500;
    throw error;
  }
  return value.trim();
}

function readTimeout(env) {
  const raw = env?.REQUEST_TIMEOUT_MS;
  if (raw == null || raw === "") {
    return DEFAULT_TIMEOUT_MS;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    const error = new Error("REQUEST_TIMEOUT_MS must be a positive number");
    error.status = 500;
    throw error;
  }
  return parsed;
}

export function loadEnvConfig(env) {
  const eggtartEmail = requireString(env, "EGGTART_EMAIL");
  const eggtartPassword = requireString(env, "EGGTART_PASSWORD");
  const baseUrl = (env?.EGGTART_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const clashUserAgent = (env?.CLASH_USER_AGENT || DEFAULT_CLASH_USER_AGENT).trim();
  const requestTimeoutMs = readTimeout(env);

  return {
    eggtartEmail,
    eggtartPassword,
    baseUrl,
    clashUserAgent,
    requestTimeoutMs,
  };
}
