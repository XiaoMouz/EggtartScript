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

function collectRenamedProxyNames(proxies: Array<Record<string, unknown>>, renameRules: RenameRule[]): Map<string, string> {
  if (!renameRules.length) return new Map<string, string>();

  const renamedNames = new Map<string, string>();
  for (const proxy of proxies) {
    if (typeof proxy.name !== "string") continue;
    let nextName = proxy.name;
    for (const [index, rule] of renameRules.entries()) {
      const regex = compileRegex(rule.pattern, rule.flags, `rename_rules[${index}]`);
      nextName = nextName.replace(regex, rule.replacement);
    }
    if (nextName !== proxy.name) {
      renamedNames.set(proxy.name, nextName);
    }
  }
  return renamedNames;
}

function collectDeletedProxyNames(proxies: Array<Record<string, unknown>>, deleteRules: DeleteRule[]): Set<string> {
  if (!deleteRules.length) return new Set<string>();

  const deletedNames = new Set<string>();
  for (const proxy of proxies) {
    if (typeof proxy.name !== "string") continue;
    const shouldDelete = deleteRules.some((rule, index) => {
      const regex = compileRegex(rule.pattern, rule.flags, `delete_rules[${index}]`);
      return regex.test(proxy.name as string);
    });
    if (shouldDelete) {
      deletedNames.add(proxy.name);
    }
  }
  return deletedNames;
}

function applyDeleteRules(proxies: Array<Record<string, unknown>>, deletedNames: Set<string>): Array<Record<string, unknown>> {
  if (!deletedNames.size) return proxies;
  return proxies.filter((proxy) => typeof proxy.name !== "string" || !deletedNames.has(proxy.name));
}

function removeDeletedProxyReferences(
  proxyGroups: Array<Record<string, unknown>>,
  deletedNames: Set<string>,
): void {
  if (!deletedNames.size) return;

  for (const group of proxyGroups) {
    if (!Array.isArray(group.proxies)) continue;
    group.proxies = group.proxies.filter((entry) => typeof entry !== "string" || !deletedNames.has(entry));
  }
}

function applyProxyGroupRenameReferences(
  proxyGroups: Array<Record<string, unknown>>,
  renamedNames: Map<string, string>,
): void {
  if (!renamedNames.size) return;

  for (const group of proxyGroups) {
    if (!Array.isArray(group.proxies)) continue;
    group.proxies = group.proxies.map((entry) => {
      if (typeof entry !== "string") return entry;
      return renamedNames.get(entry) || entry;
    });
  }
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
    console.error("Invalid Clash YAML format:", input);
    throw createHttpError("Clash YAML root must be a mapping object", 502);
  }

  const proxies = ensureArray<Record<string, unknown>>(
    (parsed.proxies as Array<Record<string, unknown>> | undefined) || ((parsed.proxies = []) as Array<Record<string, unknown>>),
    "proxies",
  );
  const rules = ensureArray<string>((parsed.rules as string[] | undefined) || ((parsed.rules = []) as string[]), "rules");
  const proxyGroups = ensureArray<Record<string, unknown>>(
    (parsed["proxy-groups"] as Array<Record<string, unknown>> | undefined) ||
      ((parsed["proxy-groups"] = []) as Array<Record<string, unknown>>),
    "proxy-groups",
  );

  const renamedNames = collectRenamedProxyNames(proxies, transformConfig.renameRules || []);
  applyRenameRules(proxies, transformConfig.renameRules || []);
  applyProxyGroupRenameReferences(proxyGroups, renamedNames);
  const deletedNames = collectDeletedProxyNames(proxies, transformConfig.deleteRules || []);
  parsed.proxies = applyDeleteRules(proxies, deletedNames);
  removeDeletedProxyReferences(proxyGroups, deletedNames);
  applyProxyChain(parsed.proxies as Array<Record<string, unknown>>, transformConfig.proxyChain || []);
  parsed.rules = [...(transformConfig.rules || []), ...rules];

  return YAML.stringify(parsed);
}
