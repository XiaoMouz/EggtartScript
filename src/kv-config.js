function parseJson(label, input) {
  if (!input) return null;
  try {
    return JSON.parse(input);
  } catch (error) {
    const err = new Error(`Invalid KV JSON in ${label}`);
    err.status = 500;
    err.details = { reason: String(error) };
    throw err;
  }
}

function asArray(value, fieldName) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    const err = new Error(`${fieldName} must be an array`);
    err.status = 500;
    throw err;
  }
  return value;
}

function assertStringArray(values, fieldName) {
  for (const item of values) {
    if (typeof item !== "string") {
      const err = new Error(`${fieldName} items must be strings`);
      err.status = 500;
      throw err;
    }
  }
  return values;
}

function validateRegexRules(rawRules, fieldName) {
  const rules = asArray(rawRules, fieldName);
  return rules.map((item, index) => {
    if (!item || typeof item !== "object") {
      const err = new Error(`${fieldName}[${index}] must be an object`);
      err.status = 500;
      throw err;
    }
    if (typeof item.pattern !== "string") {
      const err = new Error(`${fieldName}[${index}].pattern must be string`);
      err.status = 500;
      throw err;
    }
    if (fieldName === "rename_rules" && typeof item.replacement !== "string") {
      const err = new Error(`${fieldName}[${index}].replacement must be string`);
      err.status = 500;
      throw err;
    }
    if (item.flags != null && typeof item.flags !== "string") {
      const err = new Error(`${fieldName}[${index}].flags must be string`);
      err.status = 500;
      throw err;
    }
    return {
      pattern: item.pattern,
      replacement: item.replacement,
      flags: item.flags || "",
    };
  });
}

function validateProxyChain(raw) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    const err = new Error("proxy_chain must be an array");
    err.status = 500;
    throw err;
  }
  return raw.map((item, index) => {
    if (!item || typeof item !== "object") {
      const err = new Error(`proxy_chain[${index}] must be object`);
      err.status = 500;
      throw err;
    }
    if (typeof item.target !== "string" || item.target.trim() === "") {
      const err = new Error(`proxy_chain[${index}].target must be non-empty string`);
      err.status = 500;
      throw err;
    }
    if (typeof item.dialer !== "string" || item.dialer.trim() === "") {
      const err = new Error(`proxy_chain[${index}].dialer must be non-empty string`);
      err.status = 500;
      throw err;
    }
    return {
      target: item.target,
      dialer: item.dialer,
    };
  });
}

export async function loadTransformConfig(kv) {
  if (!kv || typeof kv.get !== "function") {
    const err = new Error("KV binding RULES_KV is required");
    err.status = 500;
    throw err;
  }

  const [rulesRaw, proxyChainRaw, renameRaw, deleteRaw, headersRaw] = await Promise.all([
    kv.get("rules"),
    kv.get("proxy_chain"),
    kv.get("rename_rules"),
    kv.get("delete_rules"),
    kv.get("headers"),
  ]);

  const rules = assertStringArray(asArray(parseJson("rules", rulesRaw), "rules"), "rules");
  const proxyChain = validateProxyChain(parseJson("proxy_chain", proxyChainRaw));
  const renameRules = validateRegexRules(parseJson("rename_rules", renameRaw), "rename_rules");
  const deleteRules = validateRegexRules(parseJson("delete_rules", deleteRaw), "delete_rules");

  const headersParsed = parseJson("headers", headersRaw) || {};
  if (typeof headersParsed !== "object" || Array.isArray(headersParsed)) {
    const err = new Error("headers must be a JSON object");
    err.status = 500;
    throw err;
  }
  const headers = {};
  for (const [key, value] of Object.entries(headersParsed)) {
    if (typeof value !== "string") {
      const err = new Error(`headers.${key} must be string`);
      err.status = 500;
      throw err;
    }
    headers[key] = value;
  }

  return {
    rules,
    proxyChain,
    renameRules,
    deleteRules,
    headers,
  };
}
