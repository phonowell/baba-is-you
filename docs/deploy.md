# Deploy

`auvya.com/baba` 由独立 Cloudflare Worker 项目承载（与 `erare` 同模式、共用 `auvya.com` zone，
worker 名 `baba`）。产物是**壳 HTML + 独立游戏 bundle** 的两文件结构，配合 worker 门控
让游戏只能在 auvya.com 页面上下文里运行；本地预览仍是单文件 HTML（见下文）。

## 产物布局

- `pnpm build` → `release-local/baba-is-you.html`：本地预览单文件，无域名锁，
  双击即可运行（行为与旧版一致，仅输出目录不同）。载荷同样是打包 loader
  形态，但用固定种子，file://、localhost 等任意来源均可解。
- `pnpm build:deploy` → `release/`：
  - `baba-is-you.html`：壳，只含样式与加载器，无游戏代码。加载器先查
    `location.hostname`，不符直接显示锁定提示；相符才以**绝对路径**
    `/baba/baba-is-you.js` 拉取 bundle（file:// 或其他域打开时该请求自然失败）。
  - `baba-is-you.js`：游戏 bundle 的打包 loader：载荷经 zopfli-gzip 压缩、
    XOR 密钥流掩码、base64 编码；解包种子按 `location.hostname` 从烘焙的
    掩码表还原——仅白名单主机可解出原始 gzip 流，其他来源在解码阶段即
    落到锁定提示（早于游戏代码执行）。解出的游戏代码另经 esbuild define
    注入 `__BABA_ALLOWED_HOSTS__ = ["auvya.com"]`，启动时校验
    `location.hostname`（`src/web/host-gate.ts`），不符即锁定。
- `pnpm deploy` = `pnpm build:deploy && wrangler deploy`。

允许主机名清单的单一事实源是 `scripts/build-single-html.mjs` 的
`DEPLOY_ALLOWED_HOSTS`；壳加载器与 bundle 锁共用。`/baba` 前缀同理对应
`DEPLOY_BASE_PATH` 与 worker 的 `BASE_PATH`，改时需同步。

## 前置条件

- `pnpm install`（`pnpm-workspace.yaml` 的 `allowBuilds` 已批准 `workerd`/`sharp`
  构建脚本；wrangler 依赖它们，缺了 `pnpm install` 会报 ignored builds）
- wrangler 已登录持有 `auvya.com` zone 的 Cloudflare 账号
  （`pnpm exec wrangler whoami` 确认；未登录跑 `pnpm exec wrangler login`）

## 推送

```sh
pnpm deploy
```

等价于 `pnpm build:deploy && wrangler deploy`：先把 `src/web/app.ts` 打成
`release/baba-is-you.html`（壳）与 `release/baba-is-you.js`（bundle），再由
wrangler 打包 `src/tools/deploy-worker.ts` 并上传 `release/` 全部文件为静态资产，
绑定路由。

更新就是重跑 `pnpm deploy`；回滚用 `pnpm exec wrangler rollback`（或 dashboard
按 Version ID 恢复）。

## 请求路径

`src/tools/deploy-worker.ts`：

- 只接 `GET`/`HEAD`；路径须以 `/baba` 开头，其余 404/405
- `/baba/baba-is-you.js`（bundle）仅当 `Sec-Fetch-Site: same-origin` 时才经
  `ASSETS` 下发，否则 403——直接访问（`none`）、外站嵌入（`cross-site`/
  `same-site`）、无该头的非浏览器客户端一律拒绝
- bundle 响应 `Cache-Control: private, max-age=300` + `Vary: sec-fetch-site`：
  只允许浏览器私有缓存，防止共享/边缘缓存把 200 泄漏给无 header 的请求
- 其余路径剥掉 `/baba` 前缀后查 `ASSETS`；未命中回退到入口页（SPA 式，无路由照样安全）
- 所有响应带 `Content-Security-Policy: frame-ancestors 'self'`，挡住外站 iframe 套壳
- 入口响应 `Cache-Control: public, max-age=300, s-maxage=600, stale-while-revalidate=300`

## 防护边界（如实说明）

- `Sec-Fetch-Site` 是浏览器自报的 forbidden header，curl 可伪造 → 攻击者能抓走
  JS 文件。但拿到的是 loader + 掩码载荷：载荷不是标准 gzip 字节流，
  `base64 -d | gunzip` 直接失败，且种子掩码只覆盖白名单主机——异站打开连
  解码都过不了。要提取源码须读懂 minified loader 并复现种子派生
  （派生逻辑随产物下发，是混淆而非加密）；即使解出游戏代码，离线/异站运行
  仍会被代码内烤入的域名锁拒绝。
- 纯前端做不到绝对防护；本结构的目标是：①下载的 HTML 里没有游戏本体；
  ②直接抓 JS 也不能即下即用，绕过成本抬到改代码级别。

## 坑位

- Workers assets 对 `*.html` 做 canonical 重定向（`/x.html` → `/x`）。
  `ASSETS.fetch` 必须用无扩展名路径（`/baba-is-you`），否则 307 会把请求
  带出 `/baba/*` 路由，落到 zone 上别的站点。
- `release/` 整个目录都会上传，含调试用 png；不要把私密或大文件放进去。
  本地预览产物在 `release-local/`，不会被上传。
- 部署构建按设计无法在本地完整运行（域名锁）；`pnpm exec wrangler dev` 下
  打开只能看到锁定提示，正可用来验证门控生效。
