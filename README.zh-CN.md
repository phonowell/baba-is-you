# Baba Is You CLI

中文 | [English](./README.md) | [日本語](./README.ja.md)

以终端为主的 Baba Is You 实现，采用纯逻辑核心，并提供 CLI（`src/cli.ts`）与单文件 Web（`src/web/app.ts`）两套前端。

## 快速开始

```bash
pnpm install
pnpm start
pnpm build
pnpm verify-levels:official
pnpm test
pnpm lint
pnpm type-check
```

## 核心命令

| 命令 | 说明 |
|------|------|
| `pnpm start` | 运行 CLI 游戏（`src/cli.ts`） |
| `pnpm build` | 构建单文件网页产物（`release/baba-is-you.html`） |
| `pnpm verify-levels:official` | 校验 `data/baba/*.(l|ld)` 官方关卡文本导入一致性 |
| `pnpm import-levels:official` | 重新导入官方关卡到 `src/levels-data/*.ts` |
| `pnpm test` | 运行 `src/**/*.test.ts` |
| `pnpm lint` | 检查并自动修复 `src/**/*.ts` |
| `pnpm type-check` | 仅类型检查，不产出 |

## 操作

- 菜单：`W/S` 或 `上/下` 选择，`A/D` 或 `左/右` 翻页，`Enter/N/Space` 开始，`Q` 退出（CLI）
- 游戏内：`WASD` 或方向键移动，`Space` 原地等待，`U` 撤销，`R` 重开，胜利后 `N/Enter` 下一关，`Q` 返回菜单
- CLI 进程退出：`Ctrl+C`

## 规则系统（当前实现）

- 操作符：`X IS Y`、`X HAS Y`、`X MAKE Y`、`X EAT Y`、`X WRITE Y`
- 连接与否定：`AND`、`NOT`
- 条件：`ON`、`NEAR`、`FACING`、`LONELY`
- 特殊名词：`TEXT`、`EMPTY`、`ALL`、`GROUP`、`LEVEL`
- 属性：`you`、`win`、`stop`、`push`、`move`、`open`、`shut`、`defeat`、`sink`、`hot`、`melt`、`weak`、`float`、`tele`、`pull`、`shift`、`swap`、`up`、`right`、`down`、`left`、`red`、`blue`、`best`、`fall`、`more`、`hide`、`sleep`、`group`、`facing`

## 渲染

- 终端：固定 2 列宽单元；文字块使用 2 字母缩写；`IS` 单独着色；规则与字典常驻显示
- Web：棋盘格子固定正方形；文本块显示完整单词；规则与字典在游戏内弹层查看
- Web 3D 渲染使用单一固定粘土质感 preset（更接近 NS 版《塞尔达传说：梦见岛》；不提供运行时切换）
- Web 3D 立体元素堆叠顺序固定为：`you > text > move/fall > push/pull > open/shut > else`
- 地贴元素（`tile`、`water`、`belt`）不参与上述立体堆叠优先级

## 单文件 HTML

```bash
pnpm build
```

- 输出：`release/baba-is-you.html`
- 产物为离线可运行的单文件，浏览器直接打开即可

## 关卡来源

- 入口：`src/levels.ts`
- 数据包：`src/levels-data/00-official.ts`、`src/levels-data/01-official.ts`、`src/levels-data/02-official.ts`

## 目录结构

```text
src/
  cli.ts
  levels.ts
  levels-data/
  logic/
  view/
  web/
```

## 技术栈

- Node.js + TypeScript + ESM
- Runtime: `tsx`
- Lint: ESLint（`eslint.config.mjs`）

## 开发说明

详见 [CLAUDE.md](./CLAUDE.md)
