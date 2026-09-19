# 部署版 origin 锁定（防止下载后独立运行）

## 目标
- 部署在 auvya.com/baba 的版本：下载 HTML 得不到游戏本体，且 bundle 只在 auvya.com 页面上下文中加载、运行
- 本地仍保留一个可双击运行的单文件预览版

## 分层防护设计
1. 产物拆分：部署版 = 壳 HTML（CSS + loader，无游戏代码）+ 独立 `baba-is-you.js` bundle
2. 壳用绝对路径 `/baba/baba-is-you.js` 加载 bundle：file://、其他域打开均自然失败
3. Worker 门控：`/baba/baba-is-you.js` 仅 `Sec-Fetch-Site: same-origin` 才下发；
   响应 `Cache-Control: private` + `Vary: sec-fetch-site`，防止边缘缓存把 200 泄漏给无 header 请求
4. 域名锁进 bundle：esbuild define 注入 `__BABA_ALLOWED_HOSTS__`，启动校验 `location.hostname`
5. 全响应 `Content-Security-Policy: frame-ancestors 'self'`：阻止外站 iframe 嵌套

## 已知残余风险（如实记录）
- Sec-Fetch-Site 可被 curl 伪造 → 攻击者可抓走 JS；但仍需逆向 minified bundle 里的域名锁
- 纯前端无法做到绝对防护，目标是让“保存网页即可玩”彻底失效、把绕过成本抬到改代码级别

## 产物布局
- `pnpm build` → `release-local/baba-is-you.html`（本地预览，行为与旧单文件一致，无锁）
- `pnpm build:deploy` → `release/baba-is-you.html`（壳）+ `release/baba-is-you.js`（锁定的 bundle）
- `pnpm deploy` = `pnpm build:deploy && wrangler deploy`；`release/` 仍整目录上传

## 步骤
- [x] `src/web/host-gate.ts` + app.ts 接入
- [x] build-single-html.mjs 双模式
- [x] deploy-worker.ts 门控 + 安全头
- [x] deploy-worker.test.ts
- [x] package.json / .gitignore / docs/deploy.md / AGENTS.md
- [x] pnpm check + 双构建 + wrangler dev curl 验证

## 验证记录
- `pnpm test`：402 pass / 0 fail（含 8 条 worker 门控用例）
- 我改的文件 lint/tsc 干净；`board-3d-node-sync.ts` 的 2 个 TS6133 属并行改动（smooth-turn），未动
- `pnpm build` → release-local 440KiB 单文件，解包确认无锁；`pnpm build:deploy` → 13KiB 壳 + 428KiB bundle，解包确认 `["auvya.com"]` 已烤入
- `wrangler dev` + curl：壳 200；bundle 无 header/cross-site/none → 403，same-origin → 200；
  响应头 `Cache-Control: private`、`Vary: sec-fetch-site`、`frame-ancestors 'self'` 均生效

## 状态
完成
