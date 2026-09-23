# task_plan_deploy.md

## 目标
把单文件 Web 产物部署到 `auvya.com/baba`，模式对齐 `../erare`：
独立 Cloudflare Worker 项目 + Static Assets，共用 `auvya.com` zone。

## 方案
- `wrangler.toml`：name=`baba`，routes `auvya.com/baba` + `auvya.com/baba/*`，
  assets 指向 `./release`（含 `baba-is-you.html`），`run_worker_first = true`。
- `src/tools/deploy-worker.ts`：剥 `/baba` 前缀走 `ASSETS`；
  根路径与未命中路径回退到 `/baba-is-you.html`；沿用 erare 的缓存头口径。
- `deploy` 脚本：`pnpm build && wrangler deploy`（wrangler 直接打包 TS worker，
  无需单独 worker 构建步）。
- `pnpm-workspace.yaml`：`allowBuilds` 批准 `workerd`/`sharp`（pnpm 11 新机制），
  否则 `pnpm install` 因 ignored builds 报错。

## 状态
- [x] deploy-worker.ts
- [x] wrangler.toml
- [x] package.json deploy 脚本 + wrangler devDep
- [x] pnpm-workspace.yaml allowBuilds
- [x] 部署上线：`auvya.com/baba`、`/baba/`、任意子路径均 200
- [x] `pnpm check` 全绿：当时的卡点 `scripts/build-single-html.mjs`
  （require-await）已随 `.mjs` → `.ts` 重写解决

## 备注
- Workers assets 对 `*.html` 做 canonical 重定向（`/x.html` → `/x`），
  ASSETS.fetch 必须用无扩展名路径，否则 307 会把请求带出 `/baba` 路由。
