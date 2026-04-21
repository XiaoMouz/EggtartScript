# Eggtart Cloudflare Worker

这个项目现在包含两部分：

1. 一个 TypeScript Cloudflare Worker，负责拉取 Eggtart 订阅、改写 Clash YAML、做 Token 鉴权和管理 API。
2. 一个 `React + shadcn/ui + Tailwind` 管理台，作为 Worker 静态资源部署。

## 路由

- `GET /sub/{access_token}`：返回改写后的订阅 YAML
- `GET /admin/{admin_token}`：首次管理登录，校验 token 后签发 HttpOnly 会话 cookie
- `GET /admin/_app/`：管理台前端入口
- `GET /api/admin/config`：读取当前配置
- `POST /api/admin/config`：保存 `rules`、`proxyChain`、`renameRules`、`deleteRules`、`headers`、`accessToken`
- `POST /api/admin/logout`：清理管理会话 cookie

## 环境变量（Secrets）

- `EGGTART_EMAIL`
- `EGGTART_PASSWORD`
- `EGGTART_BASE_URL`（可选，默认 `https://eggtart.pro/api/v1`）
- `CLASH_USER_AGENT`（可选，默认 `clash`）
- `REQUEST_TIMEOUT_MS`（可选，默认 `15000`）
- `ADMIN_SESSION_SECRET`：管理台 cookie 签名密钥

## Cloudflare KV

在 `wrangler.toml` 绑定 `EGGTART_CONFIG_KV`，并写入以下 key：

- `access_token`: 订阅链接 token，原始字符串
- `admin_token`: 管理登录 token，原始字符串
- `rules`: `string[]`
- `proxy_chain`: `{ target: string, dialer: string }[]`
- `rename_rules`: `{ pattern: string, replacement: string, flags?: string }[]`
- `delete_rules`: `{ pattern: string, flags?: string }[]`
- `headers`: `Record<string, string>`

其中除 `access_token` 和 `admin_token` 外，其余值都存为 JSON 字符串。

如果某些 key 不存在，Worker 会在首次读取时自动初始化：

- `rules` / `proxy_chain` / `rename_rules` / `delete_rules` 默认写入 `[]`
- `headers` 默认写入 `{}`
- `access_token` / `admin_token` 默认写入空字符串

空 token 仍视为“未配置”，不会放行订阅或管理访问。

## 本地运行

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build:admin
pnpm dev
```

`pnpm dev` 会先构建管理台，再启动 `wrangler dev`。

## 部署

```bash
pnpm deploy
```

`pnpm deploy` 会先构建管理台静态资源，再部署 Worker。
