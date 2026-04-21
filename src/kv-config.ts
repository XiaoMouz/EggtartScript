import { createHttpError } from "./config.ts";
import type {
  AccessControlConfig,
  DeleteRule,
  EditableConfigPayload,
  KVNamespaceLike,
  ProxyChainEntry,
  RenameRule,
  TransformConfig,
} from "./types.ts";

const KV_KEYS = {
  rules: "rules",
  proxyChain: "proxy_chain",
  renameRules: "rename_rules",
  deleteRules: "delete_rules",
  headers: "headers",
  accessToken: "access_token",
  adminToken: "admin_token",
} as const;

const KV_DEFAULTS = {
  [KV_KEYS.rules]: "[]",
  [KV_KEYS.proxyChain]: "[]",
  [KV_KEYS.renameRules]: "[]",
  [KV_KEYS.deleteRules]: "[]",
  [KV_KEYS.headers]: "{}",
  [KV_KEYS.accessToken]: "",
  [KV_KEYS.adminToken]: "",
} as const;

function ensureKv(kv: KVNamespaceLike | undefined): KVNamespaceLike {
  if (!kv || typeof kv.get !== "function" || typeof kv.put !== "function") {
    throw createHttpError("KV binding EGGTART_CONFIG_KV is required", 500);
  }
  return kv;
}

function parseJson(label: string, input: string | null): unknown {
  if (!input) return null;
  try {
    return JSON.parse(input);
  } catch (error) {
    throw createHttpError(`Invalid KV JSON in ${label}`, 500, { reason: String(error) });
  }
}

function asArray(value: unknown, fieldName: string): unknown[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw createHttpError(`${fieldName} must be an array`, 400);
  }
  return value;
}

function normalizeString(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw createHttpError(`${fieldName} must be string`, 400);
  }
  return value.trim();
}

function normalizeOptionalFlags(value: unknown, fieldName: string): string {
  if (value == null || value === "") return "";
  if (typeof value !== "string") {
    throw createHttpError(`${fieldName} must be string`, 400);
  }
  return value;
}

function validateRules(rawRules: unknown): string[] {
  return asArray(rawRules, "rules")
    .map((item, index) => normalizeString(item, `rules[${index}]`))
    .filter((item) => item !== "");
}

function validateRegexRules(rawRules: unknown, fieldName: "rename_rules" | "delete_rules"): Array<RenameRule | DeleteRule> {
  return asArray(rawRules, fieldName).flatMap((item, index) => {
    if (!item || typeof item !== "object") {
      throw createHttpError(`${fieldName}[${index}] must be an object`, 400);
    }

    const record = item as Record<string, unknown>;
    const pattern = normalizeString(record.pattern, `${fieldName}[${index}].pattern`);
    if (!pattern) return [];

    if (fieldName === "rename_rules") {
      const replacement = normalizeString(record.replacement, `${fieldName}[${index}].replacement`);
      return [
        {
          pattern,
          replacement,
          flags: normalizeOptionalFlags(record.flags, `${fieldName}[${index}].flags`),
        },
      ];
    }

    return [
      {
        pattern,
        flags: normalizeOptionalFlags(record.flags, `${fieldName}[${index}].flags`),
      },
    ];
  });
}

function validateProxyChain(raw: unknown): ProxyChainEntry[] {
  return asArray(raw, "proxy_chain").flatMap((item, index) => {
    if (!item || typeof item !== "object") {
      throw createHttpError(`proxy_chain[${index}] must be object`, 400);
    }

    const record = item as Record<string, unknown>;
    const target = normalizeString(record.target, `proxy_chain[${index}].target`);
    const dialer = normalizeString(record.dialer, `proxy_chain[${index}].dialer`);

    if (!target && !dialer) return [];
    if (!target || !dialer) {
      throw createHttpError(`proxy_chain[${index}] requires both target and dialer`, 400);
    }
    return [{ target, dialer }];
  });
}

function validateHeaders(raw: unknown): Record<string, string> {
  if (raw == null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw createHttpError("headers must be a JSON object", 400);
  }

  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const normalizedKey = key.trim();
    if (!normalizedKey) continue;
    if (typeof value !== "string") {
      throw createHttpError(`headers.${normalizedKey} must be string`, 400);
    }
    const normalizedValue = value.trim();
    if (!normalizedValue) continue;
    headers[normalizedKey] = normalizedValue;
  }
  return headers;
}

async function getOrInitializeKvValue(
  kv: KVNamespaceLike,
  key: keyof typeof KV_DEFAULTS,
): Promise<string> {
  const existing = await kv.get(key);
  if (existing != null) {
    return existing;
  }

  const defaultValue = KV_DEFAULTS[key];
  await kv.put(key, defaultValue);
  return defaultValue;
}

export async function loadTransformConfig(kvLike: KVNamespaceLike | undefined): Promise<TransformConfig> {
  const kv = ensureKv(kvLike);
  const [rulesRaw, proxyChainRaw, renameRaw, deleteRaw, headersRaw] = await Promise.all([
    getOrInitializeKvValue(kv, KV_KEYS.rules),
    getOrInitializeKvValue(kv, KV_KEYS.proxyChain),
    getOrInitializeKvValue(kv, KV_KEYS.renameRules),
    getOrInitializeKvValue(kv, KV_KEYS.deleteRules),
    getOrInitializeKvValue(kv, KV_KEYS.headers),
  ]);

  return {
    rules: validateRules(parseJson("rules", rulesRaw)),
    proxyChain: validateProxyChain(parseJson("proxy_chain", proxyChainRaw)),
    renameRules: validateRegexRules(parseJson("rename_rules", renameRaw), "rename_rules") as RenameRule[],
    deleteRules: validateRegexRules(parseJson("delete_rules", deleteRaw), "delete_rules") as DeleteRule[],
    headers: validateHeaders(parseJson("headers", headersRaw)),
  };
}

export async function loadEditableConfig(kvLike: KVNamespaceLike | undefined): Promise<EditableConfigPayload> {
  const kv = ensureKv(kvLike);
  const transformConfig = await loadTransformConfig(kv);
  const accessToken = await getOrInitializeKvValue(kv, KV_KEYS.accessToken);

  return {
    ...transformConfig,
    accessToken,
  };
}

export async function loadAccessControlConfig(kvLike: KVNamespaceLike | undefined): Promise<AccessControlConfig> {
  const kv = ensureKv(kvLike);
  const [accessToken, adminToken] = await Promise.all([
    getOrInitializeKvValue(kv, KV_KEYS.accessToken),
    getOrInitializeKvValue(kv, KV_KEYS.adminToken),
  ]);

  return {
    accessToken,
    adminToken,
  };
}

export async function saveEditableConfig(
  kvLike: KVNamespaceLike | undefined,
  payload: unknown,
): Promise<EditableConfigPayload> {
  const kv = ensureKv(kvLike);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw createHttpError("Request body must be an object", 400);
  }

  const record = payload as Record<string, unknown>;
  if ("adminToken" in record || "admin_token" in record) {
    throw createHttpError("admin_token is managed outside the admin UI", 400);
  }

  const normalized: EditableConfigPayload = {
    rules: validateRules(record.rules),
    proxyChain: validateProxyChain(record.proxyChain),
    renameRules: validateRegexRules(record.renameRules, "rename_rules") as RenameRule[],
    deleteRules: validateRegexRules(record.deleteRules, "delete_rules") as DeleteRule[],
    headers: validateHeaders(record.headers),
    accessToken: normalizeString(record.accessToken, "accessToken"),
  };

  if (!normalized.accessToken) {
    throw createHttpError("accessToken must be a non-empty string", 400);
  }

  await Promise.all([
    kv.put(KV_KEYS.rules, JSON.stringify(normalized.rules)),
    kv.put(KV_KEYS.proxyChain, JSON.stringify(normalized.proxyChain)),
    kv.put(KV_KEYS.renameRules, JSON.stringify(normalized.renameRules)),
    kv.put(KV_KEYS.deleteRules, JSON.stringify(normalized.deleteRules)),
    kv.put(KV_KEYS.headers, JSON.stringify(normalized.headers)),
    kv.put(KV_KEYS.accessToken, normalized.accessToken),
  ]);

  return normalized;
}
