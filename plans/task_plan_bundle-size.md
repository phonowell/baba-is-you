# 打包产物体积优化计划

## 基线

`release/baba-is-you.html` = 1122K，构成（esbuild metafile bytesInOutput）：

- three 528K（48%）—— WebGL 驱动层，必须留在 JS
- src 344K（31%）—— 关卡数据 ~174K、sprite ~50K、代码 ~120K
- n8ao 155K + postprocessing 72K（21%）—— clay 风格后处理链，用户决定全保留

整包 gzip 322K / brotli 275K / zstd-22 288K → 压缩是第一杠杆。

## 为什么不用 wasm

- three.js 驱动 WebGL 必须经 JS/DOM API，wasm 化仍需等量 JS 胶水，无收益
- `src/logic` 移植 wasm（AssemblyScript/Rust）省几十 K 但是一次重写，丢测试基建
- 唯一合理 wasm 用途是 brotli 解码器（brotli-dec-wasm ~200K），不敌原生 `DecompressionStream('gzip')`（0 字节）

## 方案：自解压单文件

1. `scripts/build-single-html.mjs`：bundle 后 `gzipSync(level 9)` → base64 → 嵌入引导脚本
2. 引导（~350B）：`atob` → `Blob.stream().pipeThrough(DecompressionStream('gzip'))` → `text()` → DOM 注入 `<script>`（语义同原 inline classic script）
3. 特性检测 `DecompressionStream`，缺失时在 `#app` 显示提示（Safari 15–16.3 窗口：有 WebGL2 无 DS）
4. `--raw` 标志保留未压缩输出，供调试产物
5. 预期：1122K → ~435K（-61%）

## 验证

- `pnpm build` 产物体积；node 侧抽取 base64→gunzip 与直出 bundle 逐字节比对
- agent-browser 实际打开页面确认渲染/console 无错（构建链路改动需验证可打开）
- `pnpm check`

## 结果（已完成）

- `release/baba-is-you.html`：1122K → **440K（-61%）**；gzip payload 322K + base64 开销，JS 部分 1083K→437K
- 校验：产物 base64 → gunzip 与 `--raw` 直出 bundle **逐字节一致**（1109423 B）
- bootstrap 端到端：Node 对产物内引导脚本 + DOM stub 执行，注入内容与 payload 一致；Edge 真实打开探针页 title 变为 UNPACK-OK（解压+注入+执行全通）；headless Edge 截图确认菜单渲染（210 关列表）
- 兼容兜底：`DecompressionStream` 缺失时 `#app` 显示提示；`--raw` 旗标产出未压缩产物供调试
- `pnpm check` 全绿（lint + type-check + 394 测试）
