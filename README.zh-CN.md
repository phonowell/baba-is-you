# Baba Is You

中文 | [English](./README.md) | [日本語](./README.ja.md)

Baba Is You 实现，采用纯逻辑核心，前端为单文件 Web（`src/web/app.ts`）。

## 快速开始

```bash
pnpm install
pnpm build
pnpm verify-levels:official   # 依赖本地 data/baba dump（已 gitignore）
pnpm test
pnpm lint
pnpm type-check
```

## 核心命令

| 命令 | 说明 |
|------|------|
| `pnpm check` | lint + 类型检查 + 测试一步完成 |
| `pnpm simulate` | 无头推演关卡（例 `pnpm simulate 0 rrdl --trace`） |
| `pnpm build` | 构建单文件网页产物（`release/baba-is-you.html`） |
| `pnpm watch` | 监听变更并重新构建单文件产物 |
| `pnpm verify-levels:official` | 对照本地 `data/baba/*.(l|ld)` dump（已 gitignore，不随仓库分发）校验官方关卡文本导入一致性 |
| `pnpm import-levels:official` | 重新导入官方关卡到 `src/levels-data/*.ts` |
| `pnpm test` | 运行 `src/**/*.test.ts` |
| `pnpm lint` | UTF-8/LF 归一化 + oxlint 检查 `src/` |
| `pnpm type-check` | 仅类型检查，不产出 |

## 操作

- 菜单：`W/S` 或 `上/下` 选择，`A/D` 或 `左/右` 翻页，`Enter/N/Space` 开始，`Q` 退出
- 游戏内：`WASD` 或方向键移动，`Space` 原地等待，`U` 撤销，`R` 重开，胜利后 `N/Enter` 下一关，`Q` 返回菜单
- 手柄（标准布局）：`十字键`/左摇杆移动或选择，`A` 等待/确认，`B` 撤销/关闭弹层，`X` 重开，`Start` 返回菜单

## 规则系统（当前实现）

- 操作符：`X IS Y`、`X HAS Y`、`X MAKE Y`、`X EAT Y`、`X WRITE Y`
- 连接与否定：`AND`、`NOT`
- 条件：`ON`、`NEAR`、`FACING`、`LONELY`
- 特殊名词：`TEXT`、`EMPTY`、`ALL`、`GROUP`、`LEVEL`
- 属性：`you`、`win`、`stop`、`push`、`move`、`open`、`shut`、`defeat`、`sink`、`hot`、`melt`、`weak`、`float`、`tele`、`pull`、`shift`、`swap`、`up`、`right`、`down`、`left`、`red`、`blue`、`best`、`fall`、`more`、`hide`、`sleep`、`group`、`facing`

## 渲染

- Web：棋盘格子固定正方形；文本块显示完整单词；规则与字典在游戏内弹层查看
- Web 3D 渲染使用单一固定粘土质感 preset，不提供运行时切换：带像素 sprite 的物体渲染为体素挤出的像素模型，其余元素（文本/emoji/字形标签）渲染为带厚度的字板，朝向箭头以叠加层形式呈现
- Web 3D 立体元素堆叠顺序固定为：`cursor > you > text > move/fall > push/pull > open/shut > else`（`cursor` 仅出现在大地图）
- 地贴元素（`tile`、`water`、`belt`、`line`）平躺渲染，不参与上述立体堆叠优先级

## 单文件 HTML

```bash
pnpm build
```

- 输出：`release/baba-is-you.html`
- 产物为离线可运行的单文件，浏览器直接打开即可

## 关卡来源

- 入口：`src/levels.ts`
- 数据包：`src/levels-data/00-official.ts` … `src/levels-data/04-official.ts`（由 `src/levels.ts` 聚合）

## 目录结构

```text
src/
  levels.ts
  levels-data/
  logic/
  tools/
  view/
  web/
```

## 技术栈

- Node.js + TypeScript + ESM
- Runtime: `tsx`
- Lint: oxlint（`.oxlintrc.json`）

## 开发说明

详见 [AGENTS.md](./AGENTS.md)
