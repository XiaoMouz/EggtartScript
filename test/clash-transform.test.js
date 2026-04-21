import test from "node:test";
import assert from "node:assert/strict";
import { transformClashYaml } from "../src/clash-transform.js";

test("applies rename/delete/proxy-chain/rule append transforms", () => {
  const input = `
proxies:
  - name: HK-A
    type: ss
    server: example.com
    port: 443
  - name: US-B
    type: ss
    server: us.example.com
    port: 443
rules:
  - MATCH,DIRECT
`;

  const output = transformClashYaml(input, {
    rules: ["DOMAIN-SUFFIX,github.com,Proxy"],
    proxyChain: [{ target: "HKG-A", dialer: "Chain-Node" }],
    renameRules: [{ pattern: "^HK-", replacement: "HKG-", flags: "" }],
    deleteRules: [{ pattern: "^US-", flags: "" }],
  });

  assert.match(output, /name: HKG-A/);
  assert.doesNotMatch(output, /name: US-B/);
  assert.match(output, /dialer-proxy: Chain-Node/);
  assert.match(output, /DOMAIN-SUFFIX,github\.com,Proxy/);
});
