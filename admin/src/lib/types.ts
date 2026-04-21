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
