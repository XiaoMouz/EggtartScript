import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.ts";
import { buildAdminSessionCookie, createAdminSessionToken } from "../src/session.ts";
import type { Env } from "../src/types.ts";

function createEnv(): Env {
  const map = new Map<string, string>([
    ["access_token", "sub-token"],
    ["admin_token", "admin-token"],
    ["rules", JSON.stringify(["MATCH,Proxy"])],
    ["proxy_chain", JSON.stringify([])],
    ["rename_rules", JSON.stringify([])],
    ["delete_rules", JSON.stringify([])],
    ["headers", JSON.stringify({})],
  ]);

  return {
    ADMIN_SESSION_SECRET: "top-secret",
    EGGTART_EMAIL: "demo@example.com",
    EGGTART_PASSWORD: "pass",
    EGGTART_CONFIG_KV: {
      async get(key: string) {
        return map.get(key) || null;
      },
      async put(key: string, value: string) {
        map.set(key, value);
      },
    },
    ASSETS: {
      async fetch(request: Request) {
        return new Response(`asset:${new URL(request.url).pathname}`, {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      },
    },
  };
}

test("admin token login redirects into the React app and sets a cookie", async () => {
  const response = await worker.fetch(new Request("https://example.com/admin/admin-token"), createEnv());

  assert.equal(response.status, 302);
  assert.equal(response.headers.get("Location"), "/admin/_app/");
  assert.match(response.headers.get("Set-Cookie") || "", /eggtart_admin_session=/);
});

test("admin API accepts a valid session cookie", async () => {
  const env = createEnv();
  const token = await createAdminSessionToken(env.ADMIN_SESSION_SECRET!);
  const response = await worker.fetch(
    new Request("https://example.com/api/admin/config", {
      headers: {
        Cookie: buildAdminSessionCookie(token).split(";")[0],
      },
    }),
    env,
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.accessToken, "sub-token");
});

test("missing tokens are auto-initialized but still treated as not configured", async () => {
  const map = new Map<string, string>();
  const env: Env = {
    ADMIN_SESSION_SECRET: "top-secret",
    EGGTART_EMAIL: "demo@example.com",
    EGGTART_PASSWORD: "pass",
    EGGTART_CONFIG_KV: {
      async get(key: string) {
        return map.get(key) || null;
      },
      async put(key: string, value: string) {
        map.set(key, value);
      },
    },
    ASSETS: {
      async fetch() {
        return new Response("ok");
      },
    },
  };

  const subResponse = await worker.fetch(new Request("https://example.com/sub/any-token"), env);
  assert.equal(subResponse.status, 500);
  assert.equal(map.get("access_token"), "");
  assert.equal(map.get("admin_token"), "");

  const adminResponse = await worker.fetch(new Request("https://example.com/admin/any-token"), env);
  assert.equal(adminResponse.status, 500);
  assert.equal(map.get("admin_token"), "");
});
