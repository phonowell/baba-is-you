# Baba Is You CLI

中文 | [English](./README.md) | [日本語](./README.ja.md)

一个终端版 Baba Is You，逻辑层纯函数，渲染层无状态。

## 快速开始

```bash
pnpm install
pnpm start
pnpm build:single-html
pnpm lint
pnpm type-check
```

## 核心命令

| 命令 | 说明 |
|------|------|
| `pnpm start` | 运行游戏（`src/cli.ts`） |
| `pnpm build:single-html` | 构建单文件网页产物（`release/baba-is-you.html`） |
| `pnpm lint` | 检查并自动修复 `src/**/*.ts` |
| `pnpm type-check` | 仅类型检查，不产出 |

## 操作

- 移动：WASD 或 方向键
- 撤销：U
- 重开：R
- 下一关/通关重开：N 或 Enter
- 退出：Q 或 Ctrl+C

## 规则（核心）

- 支持：`X IS Y`
- 属性：you, win, stop, push, defeat, sink, hot, melt
- 不支持：has, and, not, on, make

## 渲染

- 固定 2 列宽单元
- 文字块使用 2 字母缩写；IS 单独颜色
- 棋盘下方显示规则与字典
- 可用 ANSI 颜色

## 单文件 HTML

```bash
pnpm build:single-html
```

- 输出：`release/baba-is-you.html`
- 产物为离线可运行的单文件，浏览器直接打开即可
- Web 棋盘格子固定为正方形
- 文本块显示完整单词；空格子保持留白

## 关卡来源

- `src/levels.ts`

## 目录结构

```
src/
  cli.ts
  levels.ts
  logic/
  view/
```

## 技术栈

- Node.js + TypeScript + ESM
- Runtime: tsx
- Lint: ESLint (`eslint.config.mjs`)

## 开发说明

详见 [CLAUDE.md](./CLAUDE.md)
