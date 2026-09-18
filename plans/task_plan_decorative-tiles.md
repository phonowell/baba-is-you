# 移除纯装饰 tile 实体

类型：implementation
状态：✓ 已完成

## 判定规则（与用户确认）
仅移除 `tile`/`tile_*` 名词的实体，且该关卡内它**永远不可能被规则引用**：
- 关卡无 `Tile` 文本（无法拼出 TILE 规则）
- 关卡无 `all`/`not` 文本（ALL IS X / NOT X IS Y 会波及任意物体）
- 关卡无 `empty`/`lonely`/`group` 文本（占位/同格条件会受移除影响）
- overworld 的 line/level/cursor 有功能，不在范围内；地图上的 tile 实体照判

官方 8 关保留 tile（非纯装饰）：
JAYWALKERS UNITED、SEEKING ACCEPTANCE（有 Tile 文本）；
PUBLIC PARK RULES、THE FLOATIEST PLATFORMS、WHAT IS BABA?、
FLOATY PLATFORMS、ULTIMATE MAZE、POWER GENERATOR（含 all/not/empty/lonely 文本）。

## 落地结果
- `src/tools/import-official-levels-convert.ts`：`convertOneLevel` 增加惰性
  tile 丢弃（无 Tile/All/Not/Empty/Lonely/Group 文本时丢 tile 系语句），
  重跑 `pnpm import-levels:official` 不回潮
- `src/levels-data/*.ts`：30 关移除 964 个 tile 实体（diff 仅 48 行 tile 语句）
- `levels/**/*.txt`：26 文件移除 911 个 tile 实体；纯 tile 字形字符→空格、
  图例行删除、`X on tile` 复合图例改写为 `X`、`+` 覆盖指向 tile 的部分清除；
  行宽不动，棋盘尺寸与坐标不变
- `goldens/*.json`：15 个受影响金样（无内嵌 levelData、覆盖被编辑关卡）
  重放 inputs 重写快照，全部仍 win、无截断

## 验证
- 全量 levels 重解析：ASCII 关卡已无 tile 实体
- levels-data 残留 tile 仅在上述 8 个功能性关卡
- `pnpm check` 全绿（lint + type-check + 394 tests）
