import YAML from "yaml";

function ensureArray(value, fieldName) {
  if (!Array.isArray(value)) {
    const error = new Error(`Clash config field "${fieldName}" must be an array`);
    error.status = 502;
    throw error;
  }
  return value;
}

function compileRegex(pattern, flags, label) {
  try {
    return new RegExp(pattern, flags || "");
  } catch (error) {
    const err = new Error(`Invalid regex in ${label}: ${pattern}`);
    err.status = 500;
    err.details = { reason: String(error) };
    throw err;
  }
}

function applyRenameRules(proxies, renameRules) {
  if (!renameRules.length) return;
  for (const proxy of proxies) {
    if (!proxy || typeof proxy !== "object" || typeof proxy.name !== "string") continue;
    let nextName = proxy.name;
    for (const [index, rule] of renameRules.entries()) {
      const regex = compileRegex(rule.pattern, rule.flags, `rename_rules[${index}]`);
      nextName = nextName.replace(regex, rule.replacement);
    }
    proxy.name = nextName;
  }
}

function applyDeleteRules(proxies, deleteRules) {
  if (!deleteRules.length) return proxies;
  return proxies.filter((proxy) => {
    if (!proxy || typeof proxy !== "object" || typeof proxy.name !== "string") return true;
    return !deleteRules.some((rule, index) => {
      const regex = compileRegex(rule.pattern, rule.flags, `delete_rules[${index}]`);
      return regex.test(proxy.name);
    });
  });
}

function applyProxyChain(proxies, proxyChain) {
  if (!proxyChain.length) return;
  const byName = new Map(
    proxies
      .filter((item) => item && typeof item === "object" && typeof item.name === "string")
      .map((item) => [item.name, item]),
  );
  for (const rule of proxyChain) {
    const target = byName.get(rule.target);
    if (target) {
      target["dialer-proxy"] = rule.dialer;
    }
  }
}

export function transformClashYaml(input, transformConfig) {
  const parsed = YAML.parse(input);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    const error = new Error("Clash YAML root must be a mapping object");
    error.status = 502;
    throw error;
  }

  const proxies = ensureArray(parsed.proxies || (parsed.proxies = []), "proxies");
  const rules = ensureArray(parsed.rules || (parsed.rules = []), "rules");
  applyRenameRules(proxies, transformConfig.renameRules || []);
  const filteredProxies = applyDeleteRules(proxies, transformConfig.deleteRules || []);
  parsed.proxies = filteredProxies;
  applyProxyChain(parsed.proxies, transformConfig.proxyChain || []);

  for (const rule of transformConfig.rules || []) {
    rules.push(rule);
  }

  return YAML.stringify(parsed);
}
