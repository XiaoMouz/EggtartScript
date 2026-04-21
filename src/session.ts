import { createHttpError, requireTrimmedString } from "./config.ts";
import type { AdminSessionClaims, Env } from "./types.ts";

const SESSION_COOKIE_NAME = "eggtart_admin_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(input: string): Uint8Array {
  const binary = atob(input);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function base64UrlEncode(input: string): string {
  return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlEncodeBytes(input: Uint8Array): string {
  return bytesToBase64(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return atob(`${normalized}${padding}`);
}

function base64UrlDecodeBytes(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return base64ToBytes(`${normalized}${padding}`);
}

function parseCookies(header: string | null): Record<string, string> {
  if (!header) return {};
  const entries = header.split(";").map((part) => part.trim()).filter(Boolean);
  return Object.fromEntries(
    entries.map((entry) => {
      const index = entry.indexOf("=");
      if (index === -1) return [entry, ""];
      return [entry.slice(0, index), decodeURIComponent(entry.slice(index + 1))];
    }),
  );
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) {
    result |= a[index] ^ b[index];
  }
  return result === 0;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function sign(secret: string, payload: string): Promise<string> {
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return base64UrlEncodeBytes(new Uint8Array(signature));
}

export function getAdminSessionSecret(env: Env): string {
  return requireTrimmedString(env, "ADMIN_SESSION_SECRET");
}

export async function createAdminSessionToken(secret: string): Promise<string> {
  const claims: AdminSessionClaims = {
    role: "admin",
    iat: Date.now(),
    exp: Date.now() + SESSION_TTL_MS,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(claims));
  const signature = await sign(secret, encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export async function validateAdminSessionToken(token: string, secret: string): Promise<boolean> {
  const [encodedPayload, encodedSignature] = token.split(".");
  if (!encodedPayload || !encodedSignature) return false;

  const expectedSignature = await sign(secret, encodedPayload);
  if (!timingSafeEqual(base64UrlDecodeBytes(encodedSignature), base64UrlDecodeBytes(expectedSignature))) {
    return false;
  }

  const rawPayload = base64UrlDecode(encodedPayload);
  const claims = JSON.parse(rawPayload) as AdminSessionClaims;
  return claims.role === "admin" && Number.isFinite(claims.exp) && claims.exp > Date.now();
}

export async function requireAdminSession(request: Request, secret: string): Promise<void> {
  const cookies = parseCookies(request.headers.get("Cookie"));
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) {
    throw createHttpError("Admin session required", 403);
  }

  const isValid = await validateAdminSessionToken(token, secret);
  if (!isValid) {
    throw createHttpError("Admin session required", 403);
  }
}

export function buildAdminSessionCookie(token: string): string {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearAdminSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
