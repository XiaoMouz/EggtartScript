import test from "node:test";
import assert from "node:assert/strict";
import { loadEditableConfig, loadTransformConfig, saveEditableConfig } from "../src/kv-config.ts";

function createMockKv(seed?: Record<string, string>) {
  const map = new Map(Object.entries(seed || {}));
  return {
    map,
    async get(key: string) {
      return map.get(key) || null;
    },
    async put(key: string, value: string) {
      map.set(key, value);
    },
  };
}

test("loads validated transform config from kv", async () => {
  const kv = createMockKv({
    rules: JSON.stringify(["MATCH,Proxy"]),
    proxy_chain: JSON.stringify([{ target: "A", dialer: "B" }]),
    rename_rules: JSON.stringify([{ pattern: "A", replacement: "AA", flags: "" }]),
    delete_rules: JSON.stringify([{ pattern: "TEST", flags: "i" }]),
    headers: JSON.stringify({ "X-Header": "v" }),
    access_token: "sub-token",
  });

  const config = await loadTransformConfig(kv);
  assert.deepEqual(config.rules, ["MATCH,Proxy"]);
  assert.deepEqual(config.proxyChain, [{ target: "A", dialer: "B" }]);
  assert.equal(config.renameRules[0].replacement, "AA");
  assert.equal(config.deleteRules[0].flags, "i");
  assert.equal(config.headers["X-Header"], "v");

  const editable = await loadEditableConfig(kv);
  assert.equal(editable.accessToken, "sub-token");
});

test("initializes missing kv keys with empty defaults", async () => {
  const kv = createMockKv();

  const transformConfig = await loadTransformConfig(kv);
  const editableConfig = await loadEditableConfig(kv);

  assert.deepEqual(transformConfig, {
    rules: [],
    proxyChain: [],
    renameRules: [],
    deleteRules: [],
    headers: {},
  });
  assert.equal(editableConfig.accessToken, "");
  assert.equal(kv.map.get("rules"), "[]");
  assert.equal(kv.map.get("proxy_chain"), "[]");
  assert.equal(kv.map.get("rename_rules"), "[]");
  assert.equal(kv.map.get("delete_rules"), "[]");
  assert.equal(kv.map.get("headers"), "{}");
  assert.equal(kv.map.get("access_token"), "");
});

test("saves normalized config and blocks admin token edits", async () => {
  const kv = createMockKv();

  const saved = await saveEditableConfig(kv, {
    rules: ["MATCH,Proxy", " "],
    proxyChain: [{ target: "A", dialer: "B" }, { target: "", dialer: "" }],
    renameRules: [{ pattern: "A", replacement: "AA", flags: "" }],
    deleteRules: [{ pattern: "^TEST", flags: "i" }],
    headers: { "X-Test": "ok", Empty: "   " },
    accessToken: "new-token",
  });

  assert.deepEqual(saved.rules, ["MATCH,Proxy"]);
  assert.deepEqual(saved.proxyChain, [{ target: "A", dialer: "B" }]);
  assert.deepEqual(saved.headers, { "X-Test": "ok" });
  assert.equal(kv.map.get("access_token"), "new-token");

  await assert.rejects(
    () =>
      saveEditableConfig(kv, {
        rules: [],
        proxyChain: [],
        renameRules: [],
        deleteRules: [],
        headers: {},
        accessToken: "token",
        adminToken: "blocked",
      }),
    /admin_token is managed outside the admin UI/,
  );
});
