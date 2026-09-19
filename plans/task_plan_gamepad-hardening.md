# 手柄支持完善（hardening）

类型：implementation

## 目标

在既有 gamepad 基础上补齐与键盘的能力差与可及性差：

1. **按住重复 A/B**：键盘靠 OS key-repeat 实现按住连发（space=wait、u=undo），
   手柄目前只有方向重复。game 模式下 A/B 加入按住重复（首按即发，
   300ms 延迟后 140ms 定速，复用方向重复节奏）；menu 模式保持边沿单次
   （A=start 连发无意义且进入 game 后重复语义自然切换为 wait，与键盘
   按住 Space 行为一致）。X/Start/Select 始终边沿。
2. **Select 开/关帮助弹层**：reference 弹层目前只能靠点击 HUD 打开
   （键盘也没有热键），纯手柄用户不可达。Select/Back（index 8）在
   game 模式切换 reference 弹层；replay 弹层打开时忽略（B 统一关闭）。
3. **震动反馈**：status 进入 win/complete/lose 时经
   `vibrationActuator.playEffect('dual-rumble')` 震动，对齐现有
   `navigator.vibrate` 的 outcome 触觉；无 actuator 的柄静默跳过
   （渐进增强）。runtime 暴露 `rumble(effect)`，app 在 status 订阅里调用。
4. **取柄健壮性**：
   - `gamepadconnected` 事件携带的 pad index 记为 preferred，pickSnapshot
     优先使用（多柄场景最后连接者胜出，断开后回退首个 standard）；
     `gamepaddisconnected` 清掉失效 preferred。
   - 摇杆斜推且未持方向时按主轴（|axis| 大者）取方向，不再固定
     up>down>left>right 优先级；D-Pad 组合键仍走固定顺序。

## 改动面

- `src/view/input-gamepad.ts`
  - `GamepadLogicalInput` 加 `'select'`；`BUTTON_SELECT = 8`
  - `GamepadSource` 加可选 `vibrationActuator`（结构子集）
  - `GamepadRumble` 参数类型导出
  - 两个 mapper 对 'select' 返回 noop（运行时拦截，不会到达 mapper；
    switch 完备性需要）
  - `GAMEPAD_CONTROLS` 加 Select 行
- `src/web/app-gamepad.ts`
  - EDGE_INPUTS 拆为 game（x/start）与 menu（a/b/x/start）两套；
    game 模式 a/b 走重复槽（heldButton/nextBtnFireMs，镜像 heldDir）
  - dialog 分支与 pad swap 同步清 heldButton
  - select 边沿 → `toggleReferenceDialog()`（新 context 依赖）；
    replay 弹层打开时忽略
  - eventTarget 监听签名带事件参数；新增 `gamepaddisconnected` 监听
  - pickSnapshot → pickPad 返回 source+snapshot，preferredIndex 优先；
    activeSource 供 rumble
  - `rumble(effect)`：playEffect 调用包 try/catch + promise catch 吞掉
- `src/web/app.ts`
  - context 加 `toggleReferenceDialog`
  - status-buzz 订阅补 gamepad rumble（win 双脉冲、lose 单脉冲）

## 测试

- `input-gamepad.test.ts`：select 读入、两 mapper 的 select→noop
- `app-gamepad.test.ts`：
  - 按住 A 重复 wait、按住 B 重复 undo（节奏与方向一致）
  - menu 模式按住 A 不重复 start
  - select 开/关 reference 弹层；replay 弹层时忽略；menu 忽略
  - 最近连接 pad 优先、断开回退、dominant-axis 斜推
  - rumble 触发 activeSource actuator；无 actuator 不炸

## 验证

- `pnpm check` 全绿；README Controls 行同步

## 实施记录（落地后与上方设计差异）

- 落地时工作区正处于 overworld 迁移中段：menu 体系已整体替换为
  map/game 双模式（`mapGamepadMapInput`、`enter-node/leave-node`、
  统一 `handleGameCommand` 管线）。四项增强按新世界调整：
  - A/B 按住重复在 map/game 两模式都生效（与键盘按住 Space/U/Q
    的 OS 连发语义一致：map 上 A=enter、B=leave）
  - 重复槽只认真实边沿 armed——按住 B 关弹层后不会漏成 undo/leave
  - Select 拦截在 dialog 门之前，map/game 都切换 reference 弹层；
    replay 弹层打开时忽略（B 统一关闭）
  - `gamepaddisconnected` 清 preferred；摇杆斜推取主轴方向
- 事件监听签名用 `(event?: unknown)`：同一函数引用同时满足
  `EventListener` 与测试的 `() => void`/带参调用
- `GamepadVibrationActuator.playEffect` 的 type 参数用字面量联合
  `'dual-rumble' | 'trigger-rumble'`，真 Gamepad 才能赋进
  GamepadSource（strictFunctionTypes 逆变）
- 测试：6 个新用例（A/B 连发、B 关弹层不漏、select 开关/replay 忽略、
  rumble 三态、最近连接优先+断开回退、主轴斜推）
