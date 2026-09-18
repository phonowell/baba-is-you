# Deploy

`auvya.com/baba` 由独立 Cloudflare Worker 项目承载（与 `erare` 同模式、共用 `auvya.com` zone，
worker 名 `baba`）。产物是单文件 HTML，无服务端逻辑。

## 前置条件

- `pnpm install`（`pnpm-workspace.yaml` 的 `allowBuilds` 已批准 `workerd`/`sharp`
  构建脚本；wrangler 依赖它们，缺了 `pnpm install` 会报 ignored builds）
- wrangler 已登录持有 `auvya.com` zone 的 Cloudflare 账号
  （`pnpm exec wrangler whoami` 确认；未登录跑 `pnpm exec wrangler login`）

## 推送

```sh
pnpm deploy
```

等价于 `pnpm build && wrangler deploy`：先把 `src/web/app.ts` 打成
`release/baba-is-you.html`，再由 wrangler 打包 `src/tools/deploy-worker.ts`
并上传 `release/` 全部文件为静态资产，绑定路由。

更新就是重跑 `pnpm deploy`；回滚用 `pnpm exec wrangler rollback`（或 dashboard
按 Version ID 恢复）。

## 请求路径

`src/tools/deploy-worker.ts`：

- 只接 `GET`/`HEAD`；路径须以 `/baba` 开头，其余 404/405
- 剥掉 `/baba` 前缀后查 `ASSETS`；未命中回退到入口页（SPA 式，无路由照样安全）
- 响应统一加 `Cache-Control: public, max-age=300, s-maxage=600, stale-while-revalidate=300`

## 坑位

- Workers assets 对 `*.html` 做 canonical 重定向（`/x.html` → `/x`）。
  `ASSETS.fetch` 必须用无扩展名路径（`/baba-is-you`），否则 307 会把请求
  带出 `/baba/*` 路由，落到 zone 上别的站点。
- `release/` 整个目录都会上传，含调试用 png；不要把私密或大文件放进去。
