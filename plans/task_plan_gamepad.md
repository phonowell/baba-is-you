# 手柄（Gamepad）支持

## 目标
- Web 端支持标准布局手柄（standard mapping）：D-Pad/左摇杆移动、A 等待/确认、B 撤销、X 重开、Start 返回菜单
- 菜单同样可用：方向选择/翻页、A/Start 进入关卡
- 轮询按需驱动：仅在 `gamepadconnected` 后启动 RAF 轮询，无手柄时不占用帧循环；dispose 后完全停止
- 复用现有命令管线（`handleGameCommand`/`handleMenuCommand` + cooldown），不产生平行输入路径

## 分层
- `src/view/input-gamepad.ts`：纯映射层
  - `GamepadSource`（W3C Gamepad 结构子集）→ `toGamepadSnapshot`（仅接受 `mapping === 'standard'` 且未断开）
  - `readGamepadInputs`：snapshot → 逻辑输入集合（dpad 12-15 + 左摇杆阈值、A/B/X/Start）
  - `mapGamepadGameInput(input, status)`：方向→move；A→playing 时 wait、win/complete 时 next；B→undo；X→restart；Start→back-menu
  - `mapGamepadMenuInput(input)`：上下→选择、左右→翻页、A/Start→start
  - `GAMEPAD_CONTROLS`：提示文案（菜单页脚 + 参考弹层共用）
- `src/web/app-gamepad.ts`：运行时
  - `createGamepadRuntime(deps)`：`gamepadconnected` 事件启动 RAF 轮询；tick 中无手柄即自停
  - 边沿触发（按钮）+ 方向按住重复（首按即发，延迟后定速重复）
  - 分发镜像键盘：dialog 开时仅 B 关闭；game 走 cooldown + mark handled；menu 直发
  - 可注入：`getGamepads`/`requestFrame`/`cancelFrame`/`eventTarget`/`nowMs`
- `src/web/app.ts`：装配 + dispose 挂到 `onDispose`

## 测试
- `src/view/input-gamepad.test.ts`：snapshot 归一化（非 standard 丢弃）、摇杆阈值、两模式映射
- `src/web/app-gamepad.test.ts`：连接后 RAF 启动/断开自停、边沿单次触发、方向重复节奏、dialog 路径、cooldown/未生效命令不计已处理、dispose 阻断

## 文档/UI
- `src/view/render-html.ts`：`renderReferenceControlsHtml(entries)` 参数化，弹层追加 Gamepad 小节
- `src/view/render-menu-html.ts` + `src/web/app-game-view.ts`：菜单页脚第三行 GAMEPAD 提示
- README 三语 Controls 各加一行

## 验证
- `pnpm check` 全绿（lint + tsc + 392 tests）；`pnpm build` 通过
- `release/baba-is-you.html` 产物含 `gamepadconnected` 监听与 GAMEPAD 提示文案

## 按键映射（standard layout）
- 游戏内：D-Pad/左摇杆 → move（按住 300ms 后每 140ms 重复，冷却仍由 game 侧 100ms 门控）；A → wait（win/complete 时 → next）；B → undo（弹层打开时 → 关闭弹层）；X → restart；Start → back-menu
- 菜单：上/下 → 选择，左/右 → 翻页，A/Start → 进入关卡
- 非 `mapping === 'standard'` 的手柄被忽略；换 pad（index 变化）时以当前按键为基线，不重放按住状态
