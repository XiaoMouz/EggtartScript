# Eggtart Cloudflare Worker

这个 Worker 在每次请求时执行：

1. `POST /passport/auth/login`（email/password）拿到 `auth_data`
2. `GET /user/getSubscribe`（`Authorization: <auth_data>`）拿到 `subscribe_url`
3. 用 Clash User-Agent 拉取订阅 YAML
4. 从 Cloudflare KV 读取规则并改写 YAML，返回结果

## 环境变量（Secrets）

- `EGGTART_EMAIL`
- `EGGTART_PASSWORD`
- `EGGTART_BASE_URL`（可选，默认 `https://eggtart.pro/api/v1`）
- `CLASH_USER_AGENT`（可选，默认 `clash`）
- `REQUEST_TIMEOUT_MS`（可选，默认 `15000`）

## Cloudflare KV

在 `wrangler.toml` 绑定 `RULES_KV`，并写入以下 key（值均为 JSON 字符串）：

- `rules`: `string[]`，追加到 Clash `rules`
- `proxy_chain`: `{ target: string, dialer: string }[]`，给匹配 `target` 的节点加 `dialer-proxy`
- `rename_rules`: `{ pattern: string, replacement: string, flags?: string }[]`
- `delete_rules`: `{ pattern: string, flags?: string }[]`
- `headers`: `Record<string, string>`，用于请求 `subscribe_url` 的附加 Header（可覆盖 User-Agent）

## 运行

```bash
pnpm install
pnpm test
pnpm dev
```

部署：

```bash
pnpm deploy
```

