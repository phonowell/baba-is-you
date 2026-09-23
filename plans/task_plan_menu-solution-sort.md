# 菜单按 solution 排序

目标：主菜单固定排序 —— 有 solution（绑定了 golden replay）的关卡排前，没有的沉底；不加筛选控件，全部关卡照常显示。

## 方案

- 菜单格位（显示序）与 campaign 索引分离：`menuSelectedLevelIndex`、`data-level-index`、键盘网格导航全部用格位，渲染层不变
- `orderMenuLevels`（`src/view/render-menu-html.ts`）：稳定分区，`hasSolution === false` 沉底，返回 格位→源索引
- `WebAppEnvironment.menuOrder`：格位→campaign 索引；`enter-game`（入参是格位）正向解析，`return-to-menu` 反向定位
- `app.ts`：goldenBinding → menuOrder → store env；`menuLevels` 按显示序；`paintMenuPreview` 经 menuOrder 取关卡
- `app-draw.ts`：`levelMenuNumber` 注入，游戏内标题号与菜单格号一致（原 `levelIndex + 1` 在排序后会与菜单号错位）

## 状态

- [x] orderMenuLevels + 测试（render-menu-html.test.ts）
- [x] app-model.ts 索引转换
- [x] app-draw.ts / app.ts 接线
- [x] app-state.test.ts 格位↔campaign 往返用例
- [x] pnpm check（lint + type-check + 769 tests）/ pnpm build
