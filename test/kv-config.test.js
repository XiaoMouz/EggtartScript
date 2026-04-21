import test from "node:test";
import assert from "node:assert/strict";
import { loadTransformConfig } from "../src/kv-config.js";

test("loads validated transform config from kv", async () => {
  const map = new Map([
    ["rules", JSON.stringify(["MATCH,Proxy"])],
    ["proxy_chain", JSON.stringify([{ target: "A", dialer: "B" }])],
    ["rename_rules", JSON.stringify([{ pattern: "A", replacement: "AA", flags: "" }])],
    ["delete_rules", JSON.stringify([{ pattern: "TEST", flags: "i" }])],
    ["headers", JSON.stringify({ "X-Header": "v" })],
  ]);
  const kv = {
    async get(key) {
      return map.get(key) || null;
    },
  };

  const config = await loadTransformConfig(kv);
  assert.deepEqual(config.rules, ["MATCH,Proxy"]);
  assert.deepEqual(config.proxyChain, [{ target: "A", dialer: "B" }]);
  assert.equal(config.renameRules[0].replacement, "AA");
  assert.equal(config.deleteRules[0].flags, "i");
  assert.equal(config.headers["X-Header"], "v");
});
