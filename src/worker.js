import { loadEnvConfig } from "./config.js";
import { fetchSubscriptionYaml } from "./eggtart-client.js";
import { loadTransformConfig } from "./kv-config.js";
import { transformClashYaml } from "./clash-transform.js";

function jsonError(error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  return new Response(
    JSON.stringify(
      {
        error: error?.message || "Internal Server Error",
        details: error?.details,
      },
      null,
      2,
    ),
    {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    },
  );
}

async function handleRequest(env) {
  const config = loadEnvConfig(env);
  const transformConfig = await loadTransformConfig(env.RULES_KV);
  const clashUserAgent = transformConfig.headers["User-Agent"] || config.clashUserAgent;
  const subscribeHeaders = { ...transformConfig.headers };
  delete subscribeHeaders["User-Agent"];

  const { yamlText } = await fetchSubscriptionYaml({
    baseUrl: config.baseUrl,
    email: config.eggtartEmail,
    password: config.eggtartPassword,
    clashUserAgent,
    subscribeHeaders,
    timeoutMs: config.requestTimeoutMs,
  });
  const outputYaml = transformClashYaml(yamlText, transformConfig);
  return new Response(outputYaml, {
    headers: {
      "Content-Type": "text/yaml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export default {
  async fetch(request, env) {
    if (request.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405 });
    }
    try {
      return await handleRequest(env);
    } catch (error) {
      return jsonError(error);
    }
  },
};
