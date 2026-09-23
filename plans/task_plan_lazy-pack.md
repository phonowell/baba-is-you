# 打包性能 / 机制 / 懒加载优化计划

类型：implementation

## 基线（esbuild metafile，minified 总量 2931 KiB → 打包后 HTML 756 KiB，build ~20s）

- `baba-goldens` 虚拟 manifest：1.3MB（46%）——全部回放数据打进主 bundle，启动时 parse+bind
- three 528K + n8ao 155K + postprocessing 72K（26%）——菜单不需要，进关卡才用
- levels-data ~490K（17%）、pixel-sprites ~178K、其余 app+logic ~180K
- 菜单预览链路不含 three（board-3d-shared-item 只依赖 pixel-sprites/config）→ 3D 边界干净
- 289 个 golden 中 207 个带 levelIndex 钉；customLevel 只来自 start-replay/reset-level（回放路径必然在加载后）

## 方案

统一 **esbuild `format:esm` + `splitting:true`** 两种模式同构：

- 输出按文件单独走现有 pack 管线（zopfli-gzip → XOR → base64）成「payload」
- loader 引导脚本（inline，~3KB）：
  - `bytes(name)`：embedded base64 或 deploy 时 `fetch('/baba/payloads/<name>')` → XOR → DecompressionStream
  - `importModule(name)`：text → 静态 `./x` 说明符重写为依赖 blob URL（递归 await，建图在构建期断言 DAG）→ `import("./x")` 重写为 `__babaPack.import("x")`（保持懒）→ blob URL → `import()`
- 懒加载点：
  1. `board-3d-lazy.ts`（`import()` 入口，three+postfx+n8ao+board-3d 模块）→ 首次进关卡加载；菜单 `requestIdleCallback` 预取模块（不实例化 WebGL）
  2. `goldens.json` 数据 payload（非模块）→ 首次点 Replay 才解码；eager 侧只留构建期算好的 `baba-golden-index`（levelIndex→name）
- 构建期绑定：build 脚本转 `.ts`（tsx），直接 import `levels`/`parseLevel`/`bindGoldensToLevels`，产物只含已绑定 golden（未绑定的本就不可达）
- deploy：`baba-is-you.js` = loader + eager payload（entry+shared chunks）；懒 payload 落 `release/payloads/**`；worker 门控扩到 `/payloads/` 前缀（same-origin）
- local：全部 payload 内嵌单文件，blob 模块延迟 parse/compile
- `--fast`：zlib gzip 替代 zopfli（watch 用，~20s→~2-3s）；构建输出逐 payload 体积表
- `--raw`：payload 不压缩（base64 原文，loader 跳过解压），仍可单文件调试

## 步骤（全部完成）

1. ✅ `src/web/pack-format.ts`：共享纯函数（fnv1a、createKeystream、说明符扫描/重写、名称归一）+ 14 单测
2. ✅ `app-goldens.ts` 重构：`createGoldenStore(readPayload, index)`；`pack-runtime.d.ts` 声明 `__babaPack`；单测 stub 注入
3. ✅ `board-3d-lazy.ts` + `board-3d-mount.ts`（异步 mount + stale guard + dispose 阻断 + 失败可重试）+ 单测
4. ✅ `app.ts` 接线：异步 mountAndSync、index 驱动 hasSolution/Replay 按钮、异步 playReplay、idle 预取（仅拉模块不实例化 WebGL）
5. ✅ `scripts/build-single-html.ts` 重写（`.mjs` 已删）+ `package.json` scripts 切 tsx + watch 传 `--fast`
6. ✅ `deploy-worker.ts`：`/payloads/` 与 bundle 同门控（`serveGatedAsset`）
7. ✅ 验证：`pnpm check` 802 全绿；`pnpm build`（11.7s）/`build:deploy`/`build:fast`（2.4s）产物结构正确；file:// 浏览器冒烟过菜单→3D 懒挂载→Solution 回放
8. ✅ 文档：deploy.md / web-architecture.md / rendering-3d.md / AGENTS.md 已同步；`release/payloads/` 入 .gitignore

## 结果

- 本地单文件 774→747 KiB：eager `app.js` 580→141 KiB + shared 213→28 KiB；lazy `board-3d` 790→240 KiB、`goldens.json` 1675→138 KiB（只含 211 条已绑定记录）
- 部署版：壳 16 KiB + `baba-is-you.js` 228 KiB（loader+eager，掩码种子）+ `payloads/` 两个懒文件
- 构建 20s→11.7s（`--fast` 2.4s）；payload 依赖闭包、静态 import 重写、deploy 掩码解码均有 Node 探针验证

## 风险

- file:// 下 blob URL 模块 import 是否放行 —— 冒烟验证；若阻塞需回退方案
- esbuild chunk 静态环（理论上 DAG，构建期断言兜底）
- replay 结束后 customLevel 仍在 → goldenForLevel 走 loaded 缓存 identity 匹配（customLevel 即 golden.level 同对象）
