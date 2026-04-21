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

function mockUpstreamSubscription() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    if (url.endsWith("/passport/auth/login")) {
      return new Response(JSON.stringify({ data: { auth_data: "auth-token" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.endsWith("/user/getSubscribe")) {
      return new Response(JSON.stringify({ data: { subscribe_url: "https://sub.example.com/profile" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url === "https://sub.example.com/profile") {
      assert.equal(init?.method, "GET");
      return new Response(
        `proxies:\n  - name: HK-A\n    type: ss\n    server: example.com\n    port: 443\nrules:\n  - MATCH,DIRECT\n`,
        {
          status: 200,
          headers: {
            "subscription-userinfo": "upload=1; download=2; total=3; expire=4",
            "profile-title": "Eggtart Profile",
            "content-disposition": 'attachment; filename="eggtart.yaml"',
            "profile-update-interval": "12",
          },
        },
      );
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof globalThis.fetch;

  return () => {
    globalThis.fetch = originalFetch;
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

test("subscription route preserves upstream metadata headers", async () => {
  const restoreFetch = mockUpstreamSubscription();
  try {
    const response = await worker.fetch(new Request("https://example.com/sub/sub-token"), createEnv());

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("subscription-userinfo"), "upload=1; download=2; total=3; expire=4");
    assert.equal(response.headers.get("profile-title"), "Eggtart Profile");
    assert.equal(response.headers.get("content-disposition"), 'attachment; filename="eggtart.yaml"');
    assert.equal(response.headers.get("profile-update-interval"), "12");

    const body = await response.text();
    assert.match(body, /MATCH,Proxy/);
  } finally {
    restoreFetch();
  }
});

test("subscription route exposes metadata headers on HEAD requests", async () => {
  const restoreFetch = mockUpstreamSubscription();
  try {
    const response = await worker.fetch(new Request("https://example.com/sub/sub-token", { method: "HEAD" }), createEnv());

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("subscription-userinfo"), "upload=1; download=2; total=3; expire=4");
    assert.equal(response.headers.get("profile-title"), "Eggtart Profile");
    assert.equal(await response.text(), "");
  } finally {
    restoreFetch();
  }
});
