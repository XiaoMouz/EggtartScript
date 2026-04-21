export interface HttpError extends Error {
  status?: number;
  details?: unknown;
}

export interface RegexRule {
  pattern: string;
  flags: string;
}

export interface RenameRule extends RegexRule {
  replacement: string;
}

export interface DeleteRule extends RegexRule {}

export interface ProxyChainEntry {
  target: string;
  dialer: string;
}

export interface TransformConfig {
  rules: string[];
  proxyChain: ProxyChainEntry[];
  renameRules: RenameRule[];
  deleteRules: DeleteRule[];
  headers: Record<string, string>;
}

export interface EditableConfigPayload extends TransformConfig {
  accessToken: string;
}

export interface AccessControlConfig {
  accessToken: string;
  adminToken: string;
}

export interface FetchSubscriptionParams {
  baseUrl: string;
  email: string;
  password: string;
  clashUserAgent: string;
  subscribeHeaders?: Record<string, string>;
  timeoutMs: number;
}

export interface UpstreamConfig {
  eggtartEmail: string;
  eggtartPassword: string;
  baseUrl: string;
  clashUserAgent: string;
  requestTimeoutMs: number;
}

export interface KVNamespaceLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

export interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

export interface Env {
  EGGTART_EMAIL?: string;
  EGGTART_PASSWORD?: string;
  EGGTART_BASE_URL?: string;
  CLASH_USER_AGENT?: string;
  REQUEST_TIMEOUT_MS?: string;
  ADMIN_SESSION_SECRET?: string;
  EGGTART_CONFIG_KV: KVNamespaceLike;
  ASSETS?: AssetsBinding;
}

export interface AdminSessionClaims {
  role: "admin";
  exp: number;
  iat: number;
}
