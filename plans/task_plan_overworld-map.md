# Overworld 官方大地图替代菜单

类型：implementation

## 目标

web 端用官方 `leveltype=1` 地图数据实现 overworld：启动即主图，光标沿
line/图标行走，Enter 进入关卡/子图，胜利或 Esc 返回父图（光标落在刚完成的
图标上）。扁平菜单（menu mode + render-menu-html + MenuCommand 体系）整体移除。

决策（已确认）：数据源=官方 dump 地图文件；进关=光标+Enter；不做解锁门槛。
不做：ASCII index.txt 树（git 历史里有，但只覆盖 ~98 关）、图标锁定/进度。

格式结论见 `plans/notes_overworld-map.md`。

## P1 Importer：地图数据产出

- 新 `src/tools/import-official-levels-maps.ts`：`leveltype=1` 文件分流；
  扩展 .ld 解析（`[levels]`/`[paths]`/`[icons]`/`[images]`、selectorX/Y、
  customparent）；grid 装饰经 `convertOneLevel` 产 body；paths 注入为
  `line@dir` 等普通 item 行；icons 解析出 `{x,y,file,number,style,colour,icon}`，
  level 目标按 byLevelFileOrder 后的下标解析为 `levelIndex`，map 目标保留
  mapFile，解析不了标 unresolved。
- `import-official-levels.ts` 接入：emit `src/levels-maps.ts`
  （`maps[] = {file,title,body,selector,parentFile?,icons[]}` + `rootMapFile`）。
- 运行 `pnpm import-levels:official`，校验：图标/路径越界断言、未解析目标
  统计、与 levels 数组下标一致性。
- 出口：`src/levels-maps.ts` 生成且统计合理。

## P2 Logic：类型与 overworld 机制

- `game-types.ts`：`LevelItem.levelTarget?: LevelIcon`
  （`{kind:'level',levelIndex}|{kind:'map',mapFile}|{kind:'unresolved',file}`
  + `number/style/colour/icon`）；`LevelMeta.map?: {selector:[x,y],parentFile?}`。
- `src/logic/overworld.ts`：按 git HEAD 版恢复改造 —— `placeCursor`
  （returnToFile → 回链图标 → selector → 首个图标 多级回退）、`moveCursor`
  （原样）、`resolveEnterTarget`、`MapSession` 栈（descend=push /
  return-icon=pop 到已存在的 mapFile）；不含 IO。
- `step/phase-list.ts` 恢复 `cursor-move` 阶段；`step.ts` 恢复 hasCursor
  免 lose；`step-pipeline.test.ts` 同步。
- `src/logic/map-level.ts`：`levelDataForMap(entry)` 把 emitted map 组装成
  LevelData（body 解析 + icon items 注入 + meta.map）。
- 测试：`overworld.test.ts` 按新 target 类型恢复改造；cursor 阶段顺序、
  免 lose 用例。
- 出口：`pnpm test` 相关用例绿。

## P3 View：输入映射与菜单拆除

- `input.ts`：GameCommand 加 `{type:'enter'}`；删 MenuCommand/
  mapMenuGesture/MENU_CONTROLS/MENU_TOUCH_CONTROLS；加 MAP_CONTROLS 提示。
- `input-web.ts`：`mapMapKeyboardEvent`（arrows=move、Enter/Space=enter、
  u=undo、r=restart、q/Escape=back）；game 键盘保持。
- `input-gamepad.ts`：map 手柄映射（A=enter、B/Start=leave）。
- `render-menu-html.ts` 及其测试/引用全删；style.css 的 .menu-* 收尾。
- `stack-policy.ts`：恢复 cursor 层（HEAD 版），line 已在。
- 出口：`pnpm type-check` 无 menu 残留引用。

## P4 渲染：sprite 与图标徽标

- `pixel-sprites/data/misc.ts`：恢复 `cursor`/`map`/`level` sprite（HEAD 版）。
- 新增 `icon_*` 世界图标 sprite（lake/island/ruins/forest/abstract/space/
  cave/garden/mountain/fall/dust/level，~12 个手绘）。
- `board-3d-shared-item.ts`：`item.levelTarget` → 徽标 spec（number→数字、
  letter→字母、special→符号、world→icon sprite、unresolved→置灰），key 含
  target 区分纹理。
- 出口：地图板渲染出图标/路径/光标/装饰。

## P5 App：会话、输入接线与绘制

- `app-model.ts`：`mode:'map'|'game'`；`session: {mapFile,returnToFile?}[]`
  栈；boot=rootMap 光标在 selector；动作：move(图=step)、enter-node
  （level→进关、map→下钻/回父、unresolved→noop）、leave-node（game→回图
  光标落 returnToFile；map→弹栈，空栈跟 parentFile）、win 后 'next'=leave-node、
  reset-level（图=重建）。删 menuSelectedLevelIndex/select-menu-level/
  mark-campaign-complete 链路；customLevel/replay 保留。
- `app-commands.ts`/`app-controller.ts`：map mode 走 GameCommand→动作映射；
  enter→enter-node、back-menu→leave-node；删 MenuCommand 分支。
- `app-pointer.ts`：board 手势按 mode 分流（map：swipe=move、tap=enter）；
  删 `.menu-list` 分支（consumeSuppressedClick 若无残留一并收）。
- `app-events.ts`：删 start-level/select 菜单动作；对话框保持。
- `app-gamepad.ts`：menu→map 分支。
- `app.ts`/`app-store.ts`：maps 装载（levelDataForMap）、去 menuLevels。
- `app-draw.ts`：mode 'map' 复用 game view+3D 渲染；document.title、
  fullscreen class、菜单 in-place 更新删除。
- `app-game-view.ts`/status-line：map mode 标题/状态显示。
- 出口：`pnpm check` 绿；启动进主图、能走进关卡、赢后回图光标落图标、
  子图下钻/Esc 返回。

## P6 清理与验证（done）

- AGENTS.md/README 更新（overworld 入口、操作说明、目录结构）—— 三语 README
  控制说明已改为大地图导航；AGENTS.md 目录结构补 `levels-maps.ts`/overworld。
- `pnpm check`（lint+type-check 绿，本人范围测试 82/82）+ `pnpm build` 绿。
- 浏览器实测（headless Chrome）：启动即 106level 主图；图标按 number/letter/
  ✦special/world-sprite/unresolved 分样式渲染；方向键沿 line 行走；Enter 进关
  （状态栏切游戏 HUD）；Q 返回地图；再次 Enter 可再进。
- 修过：`board-3d-renderer-materials.ts` visualKeyForItem 缺 levelTarget →
  所有图标共享首个徽标（全显示同一数字）；补 target 进 key。
- `back-menu` 命令更名 `back`（菜单概念已不存在）；死 CSS `.menu-*` 块删除，
  `.hint-item`（reference 弹层仍在用）保留；`game-menu` 动作 id 更名 `game-map`。
- 已知边界：孤立图标（center/depths/meta/?）走不到——忠实于官方数据；
  地图意外 win → leave-node 处理（model 已实现）；89 个 unresolved 图标渲染
  为置灰牌，不可进入。

## 风险

- .ld 坐标偏移（-1 crop）若错 → 图标/路径整体漂移：P1 用越界断言+截图验证。
- 主图 baba/is/you/flag/win 装饰形成活规则：忠实保留，playtest 若 baba
  乱走干扰导航再评估剥离；map 意外 win → 当 leave-node 处理。
- 菜单拆除面较大（多人并行工作区）：只删 menu 专属代码，手势/parallax/
  suppressed-click 等通用机制保留。
