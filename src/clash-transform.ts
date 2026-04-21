import YAML from "yaml";
import { createHttpError } from "./config.ts";
import type { DeleteRule, ProxyChainEntry, RenameRule, TransformConfig } from "./types.ts";

function ensureArray<T>(value: T[] | undefined, fieldName: string): T[] {
  if (!Array.isArray(value)) {
    throw createHttpError(`Clash config field "${fieldName}" must be an array`, 502);
  }
  return value;
}

function compileRegex(pattern: string, flags: string, label: string): RegExp {
  try {
    return new RegExp(pattern, flags || "");
  } catch (error) {
    throw createHttpError(`Invalid regex in ${label}: ${pattern}`, 500, { reason: String(error) });
  }
}

function applyRenameRules(proxies: Array<Record<string, unknown>>, renameRules: RenameRule[]): void {
  if (!renameRules.length) return;

  for (const proxy of proxies) {
    if (typeof proxy.name !== "string") continue;
    let nextName = proxy.name;
    for (const [index, rule] of renameRules.entries()) {
      const regex = compileRegex(rule.pattern, rule.flags, `rename_rules[${index}]`);
      nextName = nextName.replace(regex, rule.replacement);
    }
    proxy.name = nextName;
  }
}

function applyDeleteRules(proxies: Array<Record<string, unknown>>, deleteRules: DeleteRule[]): Array<Record<string, unknown>> {
  if (!deleteRules.length) return proxies;

  return proxies.filter((proxy) => {
    if (typeof proxy.name !== "string") return true;
    return !deleteRules.some((rule, index) => {
      const regex = compileRegex(rule.pattern, rule.flags, `delete_rules[${index}]`);
      return regex.test(proxy.name as string);
    });
  });
}

function applyProxyChain(proxies: Array<Record<string, unknown>>, proxyChain: ProxyChainEntry[]): void {
  if (!proxyChain.length) return;

  const byName = new Map(
    proxies
      .filter((item) => typeof item?.name === "string")
      .map((item) => [item.name as string, item]),
  );

  for (const rule of proxyChain) {
    const target = byName.get(rule.target);
    if (target) {
      target["dialer-proxy"] = rule.dialer;
    }
  }
}

export function transformClashYaml(input: string, transformConfig: TransformConfig): string {
  const parsed = YAML.parse(input) as Record<string, unknown>;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw createHttpError("Clash YAML root must be a mapping object", 502);
  }

  const proxies = ensureArray<Record<string, unknown>>(
    (parsed.proxies as Array<Record<string, unknown>> | undefined) || ((parsed.proxies = []) as Array<Record<string, unknown>>),
    "proxies",
  );
  const rules = ensureArray<string>((parsed.rules as string[] | undefined) || ((parsed.rules = []) as string[]), "rules");

  applyRenameRules(proxies, transformConfig.renameRules || []);
  parsed.proxies = applyDeleteRules(proxies, transformConfig.deleteRules || []);
  applyProxyChain(parsed.proxies as Array<Record<string, unknown>>, transformConfig.proxyChain || []);

  for (const rule of transformConfig.rules || []) {
    rules.push(rule);
  }

  return YAML.stringify(parsed);
}
