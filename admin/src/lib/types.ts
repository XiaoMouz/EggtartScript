export interface ProxyChainEntry {
  target: string;
  dialer: string;
}

export interface RenameRule {
  pattern: string;
  replacement: string;
  flags: string;
}

export interface DeleteRule {
  pattern: string;
  flags: string;
}

export interface EditableConfigPayload {
  rules: string[];
  proxyChain: ProxyChainEntry[];
  renameRules: RenameRule[];
  deleteRules: DeleteRule[];
  headers: Record<string, string>;
  accessToken: string;
}

export interface SubscriptionMetadataSnapshot {
  profileTitle: string | null;
  contentDisposition: string | null;
  profileUpdateInterval: string | null;
  rawUserInfo: string | null;
  uploadBytes: number | null;
  downloadBytes: number | null;
  totalBytes: number | null;
  expireAt: number | null;
}
