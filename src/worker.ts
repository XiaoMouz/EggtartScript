import { transformClashYaml } from "./clash-transform.ts";
import { createHttpError, loadEnvConfig } from "./config.ts";
import { fetchSubscriptionYaml } from "./eggtart-client.ts";
import { loadAccessControlConfig, loadEditableConfig, loadTransformConfig, saveEditableConfig } from "./kv-config.ts";
import {
  buildAdminSessionCookie,
  clearAdminSessionCookie,
  createAdminSessionToken,
  getAdminSessionSecret,
  requireAdminSession,
} from "./session.ts";
import type { AssetsBinding, Env, HttpError } from "./types.ts";

const ADMIN_APP_PREFIX = "/admin/_app";

function buildSubscriptionResponseHeaders(metadataHeaders: Record<string, string>): Headers {
  const headers = new Headers({
    "Content-Type": "text/yaml; charset=utf-8",
    "Cache-Control": "no-store",
  });

  for (const [key, value] of Object.entries(metadataHeaders)) {
    headers.set(key, value);
  }

  return headers;
}

function jsonResponse(data: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

function jsonError(error: unknown): Response {
  const typedError = error as HttpError;
  const status = Number.isInteger(typedError?.status) ? typedError.status! : 500;
  return jsonResponse(
    {
      error: typedError?.message || "Internal Server Error",
      details: typedError?.details,
    },
    status,
  );
}

function getAssetBinding(env: Env): AssetsBinding {
  if (!env.ASSETS || typeof env.ASSETS.fetch !== "function") {
    throw createHttpError("ASSETS binding is required", 500);
  }
  return env.ASSETS;
}

async function handleSubscription(method: "GET" | "HEAD", env: Env): Promise<Response> {
  const config = loadEnvConfig(env);
  const transformConfig = await loadTransformConfig(env.EGGTART_CONFIG_KV);
  const clashUserAgent = transformConfig.headers["User-Agent"] || config.clashUserAgent;
  const subscribeHeaders = { ...transformConfig.headers };
  delete subscribeHeaders["User-Agent"];

  const { yamlText, metadataHeaders } = await fetchSubscriptionYaml({
    baseUrl: config.baseUrl,
    email: config.eggtartEmail,
    password: config.eggtartPassword,
    clashUserAgent,
    subscribeHeaders,
    timeoutMs: config.requestTimeoutMs,
  });

  const responseHeaders = buildSubscriptionResponseHeaders(metadataHeaders);
  if (method === "HEAD") {
    return new Response(null, { headers: responseHeaders });
  }

  const outputYaml = transformClashYaml(yamlText, transformConfig);
  return new Response(outputYaml, { headers: responseHeaders });
}

async function handleSubRoute(request: Request, env: Env, token: string): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const { accessToken } = await loadAccessControlConfig(env.EGGTART_CONFIG_KV);
  if (!accessToken.trim()) {
    throw createHttpError("KV key access_token is not configured", 500);
  }
  if (token !== accessToken) {
    throw createHttpError("Invalid access token", 403);
  }
  return handleSubscription(request.method, env);
}

async function handleAdminLogin(env: Env, token: string): Promise<Response> {
  const { adminToken } = await loadAccessControlConfig(env.EGGTART_CONFIG_KV);
  if (!adminToken.trim()) {
    throw createHttpError("KV key admin_token is not configured", 500);
  }
  if (token !== adminToken) {
    throw createHttpError("Invalid admin token", 403);
  }

  const sessionSecret = getAdminSessionSecret(env);
  const sessionToken = await createAdminSessionToken(sessionSecret);
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${ADMIN_APP_PREFIX}/`,
      "Set-Cookie": buildAdminSessionCookie(sessionToken),
      "Cache-Control": "no-store",
    },
  });
}

function rewriteAdminAssetRequest(request: Request): Request {
  const url = new URL(request.url);
  const nextPath = url.pathname.replace(/^\/admin\/_app/, "") || "/";
  url.pathname = nextPath.startsWith("/") ? nextPath : `/${nextPath}`;
  return new Request(url.toString(), request);
}

async function serveAdminAssets(request: Request, env: Env): Promise<Response> {
  const sessionSecret = getAdminSessionSecret(env);
  await requireAdminSession(request, sessionSecret);

  const assets = getAssetBinding(env);
  const rewrittenRequest = rewriteAdminAssetRequest(request);
  const response = await assets.fetch(rewrittenRequest);
  return new Response(response.body, response);
}

async function handleAdminUi(request: Request, env: Env, pathname: string): Promise<Response> {
  if (pathname === "/admin") {
    return Response.redirect(`${ADMIN_APP_PREFIX}/`, 302);
  }

  if (pathname.startsWith(`${ADMIN_APP_PREFIX}/`) || pathname === ADMIN_APP_PREFIX) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405 });
    }
    return serveAdminAssets(request, env);
  }

  const match = pathname.match(/^\/admin\/([^/]+)\/?$/);
  if (match) {
    if (request.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405 });
    }
    return handleAdminLogin(env, decodeURIComponent(match[1]));
  }

  return new Response("Not Found", { status: 404 });
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch (error) {
    throw createHttpError("Request body must be valid JSON", 400, { reason: String(error) });
  }
}

async function handleAdminApi(request: Request, env: Env, pathname: string): Promise<Response> {
  const sessionSecret = getAdminSessionSecret(env);
  await requireAdminSession(request, sessionSecret);

  if (pathname === "/api/admin/config") {
    if (request.method === "GET") {
      const config = await loadEditableConfig(env.EGGTART_CONFIG_KV);
      return jsonResponse(config);
    }

    if (request.method === "POST") {
      const body = await readJsonBody(request);
      const savedConfig = await saveEditableConfig(env.EGGTART_CONFIG_KV, body);
      return jsonResponse({
        ok: true,
        config: savedConfig,
        savedAt: new Date().toISOString(),
      });
    }

    return new Response("Method Not Allowed", { status: 405 });
  }

  if (pathname === "/api/admin/logout") {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }
    return new Response(null, {
      status: 204,
      headers: {
        "Set-Cookie": clearAdminSessionCookie(),
        "Cache-Control": "no-store",
      },
    });
  }

  return new Response("Not Found", { status: 404 });
}

async function routeRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;

  const subMatch = pathname.match(/^\/sub\/([^/]+)\/?$/);
  if (subMatch) {
    return handleSubRoute(request, env, decodeURIComponent(subMatch[1]));
  }

  if (pathname.startsWith("/api/admin")) {
    return handleAdminApi(request, env, pathname);
  }

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return handleAdminUi(request, env, pathname);
  }

  throw createHttpError("Not Found", 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await routeRequest(request, env);
    } catch (error) {
      return jsonError(error);
    }
  },
};
