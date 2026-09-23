# Baba Is You

中文 | [English](./README.md) | [日本語](./README.ja.md)

Baba Is You 实现，采用纯逻辑核心，前端为单文件 Web（`src/web/app.ts`）。

**在线试玩：https://auvya.com/baba**

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
| `pnpm build` | 构建本地单文件网页产物（`release-local/baba-is-you.html`） |
| `pnpm build:deploy` | 构建部署版壳 + 受门控 bundle（`release/`） |
| `pnpm deploy` | 构建部署版并发布到 `auvya.com/baba`（见 `docs/deploy.md`） |
| `pnpm watch` | 监听变更并重新构建单文件产物 |
| `pnpm verify-levels:official` | 对照本地 `data/baba/*.(l|ld)` dump（已 gitignore，不随仓库分发）校验官方关卡文本导入一致性 |
| `pnpm import-levels:official` | 重新导入官方关卡到 `src/levels-data/*.ts` |
| `pnpm test` | 运行 `src/**/*.test.ts` |
| `pnpm lint` | UTF-8/LF 归一化 + oxlint 检查 `src/` |
| `pnpm type-check` | 仅类型检查，不产出 |

## 操作

- 应用启动即扁平选关菜单：全部官方关卡组成编号网格，右侧画布预览高亮关卡。`WASD`/方向键移动选中（`左/右`按格、`上/下`按行），`PgUp`/`PgDn` 翻页，`Enter`/`Space`/`N` 或点按进入；悬停某格即选中并刷新预览
- 游戏内：`WASD` 或方向键移动，`Space` 原地等待，`U/Z` 撤销，`R` 重开，胜利后 `N/Enter` 进入下一关，`Q` 返回菜单
- HUD 按钮与键盘动词一一对应（撤销/等待/重开/菜单）；当前关卡有录制回放时出现 **Solution** 按钮播放 golden——回放期间除 `Q`（中止回菜单）外所有输入忽略
- 触屏：滑动移动、点按等待，其余走 HUD 按钮；竖屏手机强制横屏
- 手柄（标准布局）：`十字键`/左摇杆移动或菜单导航，`A` 等待/进入，`B` 撤销/返回/关闭弹层，`X` 重开，`Start` 返回，`Select` 打开操作与规则弹层；按住 `A`/`B` 连发等待/撤销；胜负时支持震动手柄会振动

## 规则系统（当前实现）

- 操作符：`X IS Y`、`X HAS Y`、`X MAKE Y`、`X EAT Y`、`X WRITE Y`、`X FEAR Y`、`X FOLLOW Y`、`X MIMIC Y`、`X PLAY Y`、`X BECOME Y`
- 连接与否定：`AND`、`NOT`（可作用于主语、谓语对象与条件对象）
- 中置条件：`ON`、`NEAR`、`FACING`、`NEXTTO`、`FACEDBY`、`SEEING`、`WITHOUT`、`ABOVE`、`BELOW`、`BESIDELEFT`、`BESIDERIGHT`、`FEELING`
- 前缀条件：`LONELY`、`IDLE`、`OFTEN`、`SELDOM`、`POWERED`、`POWERED2`、`POWERED3`
- 特殊名词：`TEXT`、`EMPTY`、`ALL`、`GROUP`、`GROUP2`、`GROUP3`、`LEVEL`
- 字母单位（`a`–`z`、`0`–`9`、`sharp`、`flat`、`ab`、`ba`）从不单独成词——相邻 ≥2 格的字母行/列会拼出所有词典词子串参与规则；含 `PLAY` 文本的关卡切换为音符词典
- 属性：完整官方 type-2 词表见 `src/logic/types.ts` 的 `CORE_PROPERTIES`——`you`/`you2`/`3d`、`win`/`end`/`done`、`stop`、`push`、`pull`、`move`、`auto`、`chill`、`open`、`shut`、`defeat`、`sink`、`hot`、`melt`、`weak`、`float`、`tele`、`shift`、`swap`、`facing`、`up`/`right`/`down`/`left`、`fall`/`fallup`/`fallleft`/`fallright`、`back`、`reverse`、`revert`、`more`、`hide`、`sleep`、`still`、`broken`、`safe`、`word`、`phantom`、`hold`、`select`、`boom`、`turn`、`deturn`、`nudge*`、`locked*`、`power`/`power2`/`power3`、`bonus`、`best`、`group`/`group2`/`group3`，以及惰性情绪/颜色/元词（`wonder`、`sad`、`happy`、`angry`、`party`、`pet`、`red`、`blue`……）——按属性解析以保证导入的官方规则文本不退化为名词

## 渲染

- Web：棋盘格子固定正方形；文本块显示完整单词；规则与操作在游戏内弹层查看
- Web 3D 渲染使用单一固定粘土质感 preset，不提供运行时切换：带像素 sprite 的物体渲染为体素挤出的像素模型，其余元素（文本/emoji/字形标签）渲染为带厚度的字板，朝向箭头以凸起叠加层呈现
- Web 3D 立体元素堆叠顺序固定为：`cursor > you > text > move/fall > push/pull > open/shut > else`
- 地贴元素（`tile`、`water`、`lava`、`belt`、`line` 及导入的 `tile_*` 地板图块）平躺渲染，不参与上述立体堆叠优先级
- `level is you`/`move`/`fall*`/`push`/`pull` 整体滚动或旋转房间——纯渲染偏移，不产生逻辑位移
- 渲染按需驱动：常驻动效不单独维持 RAF

## 单文件 HTML

```bash
pnpm build
```

- 输出：`release-local/baba-is-you.html`
- 产物为离线可运行的单文件，浏览器直接打开即可
- `pnpm build:deploy` 则产出 `release/baba-is-you.html`（壳加载器）+ `release/baba-is-you.js`（仅 `auvya.com` 可运行的受门控 bundle）——见 [docs/deploy.md](./docs/deploy.md)

## 关卡来源

- 入口：`src/levels.ts`——聚合 12 个数据包（`src/levels-data/00-official.ts` … `11-official.ts`，约 566 关），由 `pnpm import-levels:official` 生成
- 官方 `leveltype=1` overworld 地图只参与导入校验——应用走扁平菜单选关，不再生成可玩地图数据
- `levels/**/*.txt`：实体列表语法关卡夹具，由 `src/logic/parse-level.ts` 解析（供 golden 回放装载；支持同格多实体）
- `goldens/**/*.json`：通关回放记录，由 `src/logic/goldens.test.ts` 全量回放断言，并在应用内绑定到对应关卡驱动 Solution 按钮

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
- Web: Three.js + postprocessing + n8ao
- Lint: oxlint（`.oxlintrc.json`）

## 开发说明

详见 [AGENTS.md](./AGENTS.md) 与 [文档索引](./docs/README.md)
- 逻辑架构：[docs/logic-architecture.md](./docs/logic-architecture.md)
- Web 应用架构：[docs/web-architecture.md](./docs/web-architecture.md)
- 3D 渲染：[docs/rendering-3d.md](./docs/rendering-3d.md)
- 关卡数据与 goldens：[docs/level-data.md](./docs/level-data.md)
