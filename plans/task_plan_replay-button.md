# task_plan_replay-button

## 目标
关卡内工具栏的 "Replays" 按钮改为单一直放按钮（最终定名 "Solution"）：点击直接播放当前关卡的 golden，
不再弹出 golden 列表对话框；线上 deploy 版同样内嵌 golden manifest、按钮可用。

## 关卡 ↔ golden 匹配（已用脚本验证，85 个 golden 中 61 个可绑定）
- `titleKey` = 归一化标题（去非字母数字）+ `宽x高`：campaign 210 关仅 1 组冲突
  （`BRIDGE BUILDING`/`BRIDGE BUILDING?` → 103/104）
- `itemSig` = `{isText?'!':''}name@x,y` 去重排序集合（忽略朝向与重复实体）：
  可对 title 冲突消歧，也可独立命中改过关名的 golden（`BRIDGE BUILDING Q`→104、`BRIDGES Q`→105）
- 逐 golden 解析：titleKey 唯一命中 → 命中；titleKey 多命中时 itemSig 唯一 → 命中；
  titleKey 无命中时 itemSig 唯一 → 命中；否则不绑定
- 一关多 golden（0→0-0/0-1、22→1/12-0/1/12-1）：取 manifest 排序首个
- 24 个 golden 无对应 campaign 关（Jelly Throne 等未导入/改名关），按钮不可达，仍由 goldens.test 覆盖

## 步骤
1. `src/web/app-golden-binding.ts`（新）：`bindGoldensToLevels(goldens, levels)` →
   `{ forLevelIndex(i), forLevel(level) }`；forLevel 先对象同一性再 itemSig（回放中 customLevel
   即 golden.level 本体，可重播）
2. `app-model.ts`：删 `showReplayDialog` 字段、`toggle/close-replay-dialog` 动作、相关重置与
   snapshot 字段；保留 `start-replay`/`replay-step`/`replay`/`customLevel`
3. `app-controller.ts`：删 isReplayDialogOpen/closeReplayDialog/toggleReplayDialog
4. `app-game-view.ts`：删 ReplayEntry/picker DOM/showReplayDialog；选项改 `hasGoldenReplay?: boolean`，
   按钮文案 `Solution`、`data-action="play-replay"`、无 aria-haspopup
5. `app-draw.ts`：`replays` 选项 → `hasGoldenReplay: () => boolean`（建 view 时求值）
6. `app-events.ts`：删 toggle/close-replays、play-golden 分支与 backdrop 关闭；加 `play-replay`→`playReplay`；
   keydown 删 replay 对话框分支
7. `app-pointer.ts`/`app-gamepad.ts`：删 isReplayDialogOpen/closeReplayDialog
8. `app.ts`：`bindGoldensToLevels(goldenReplays, levelData)`；`goldenForCurrentBoard()`
   （game 模式：customLevel→forLevel，否则 forLevelIndex）；click handler 接 `playReplay`
9. `style.css`：删 .replay-backdrop/.replay-dialog/.replay-list/.replay-row/.replay-item 等死样式
10. 测试：新 `app-golden-binding.test.ts`；改 app-events/app-replay/app-gamepad/app-draw 测试
11. `pnpm check` + `pnpm build` 验证

## 状态：已完成
- 全部步骤落地；`pnpm lint`、`pnpm type-check` 通过；`pnpm check` 430/430 全绿
- 命名定稿 `Solution`（按钮 + 状态行 `SOLUTION {name} — x/y`）；内部标识仍用 replay 词系
- deploy 版同步上线：`build-single-html.mjs` 不再对 `--deploy` 置空 manifest，85+3 条
  golden 全部打进 `release/baba-is-you.js`（421→455 KiB，+34 KiB）
- 浏览器冒烟（本地）：地图无按钮 → 进 47 关 SKELETAL DOOR 出现按钮 → 点击直接播 `4/e-0`
  → 再点重播 → 放完 `WIN!` 交还控制
- 24 个 golden 无对应 campaign 关（未导入/改名），不可达但 goldens.test 仍覆盖
