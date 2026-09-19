# task_plan: 产物压缩与混淆增强

## 目标
在 `scripts/build-single-html.mjs` 单一构建链路内增强产物的压缩率与反提取成本，不引入重型混淆器。

## 状态：已完成

## 改动
- [x] 压缩：gzipSync(zlib-9) → `@gfx/zopfli` `gzipAsync`（numiterations=5，
      本地 1MB 载荷约 2s，比 zlib-9 小 ~4.4%）
- [x] esbuild：`target: es2022`、`charset: utf8`（emoji/箭头字面量不再转
      `\uXXXX`）、`drop: ['console','debugger']`（three.js 告警也不进产物）
- [x] 混淆：载荷 = zopfli-gzip → XOR 密钥流（mulberry32）→ base64。
      - 本地构建：固定种子，file://、localhost 任意来源可解
      - 部署构建：按主机名烘焙 `seed ^ fnv1a(salt|host)` 掩码表，
        白名单主机还原同一种子，其他来源解码阶段即锁定
      - `fnv1a`/`createKeystream` 经 `toString()` 注入 loader，
        构建侧与运行时共用同一实现（函数体只许用全局对象）
- [x] 文档：`docs/deploy.md` 产物布局与防护边界如实更新（XOR 是混淆
      不是加密，派生逻辑随产物下发）

## 验证
- `node /tmp/verify-pack.mjs` 端到端：local@file://、local@localhost、
  deploy@auvya.com 解出字节与 `--raw` 构建完全一致；
  deploy@evil.example.com 落到锁定提示
- 载荷首字节 `22 21 15 4f`（非 `1f 8b`），不再是标准 gzip 流
- 尺寸：local 441→423 KiB，deploy bundle 427→409 KiB
- `pnpm lint` 通过；`pnpm type-check`/`pnpm test` 各有 1 处既有失败，
  均为并行 replay 改动（app-draw.ts/app-replay.ts/tmp-dump-l.ts），与本改动无关

## 未采纳（成本>收益）
- `javascript-obfuscator`：体积+运行时成本高，收益与 XOR 打包重叠
- `mangleProps`：无命名约定可安全匹配，误伤 DOM/three 属性风险大
- brotli/zstd：`DecompressionStream` 不支持，需内置解码器得不偿失
