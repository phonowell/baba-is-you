# notes_menu_ui_state_machine

## Decisions
- 采用双状态应用模型：`menu` 与 `game`。
- 启动后默认显示菜单，不自动开局；菜单默认选择最新关卡。
- 保留游戏内原有移动/撤销/重开/过关行为；仅调整 `q` 语义为返回菜单。
- 将完整退出动作限定在菜单（菜单 `q` 或 `Ctrl+C`）。

## Input Mapping
- `src/view/input.ts`
  - `mapGameKeypress`: 游戏态命令（含 `back-menu`）。
  - `mapMenuKeypress`: 菜单态命令（含 `quit-app` / `start` / 上下选择）。

## Rendering
- 新增 `src/view/render-menu.ts` 输出菜单 UI：
  - 游戏标题
  - 关卡总数
  - 最新关卡与当前选中关卡信息
  - 操作提示
  - 关卡列表（窗口化显示）

## CLI Flow
- `src/cli.ts`
  - 移除参数解析（`--level` / `--list-levels` / `--help`）。
  - 键盘事件按当前模式分发到不同输入映射。
  - 游戏态 `q` -> `returnToMenu()`；菜单态 `q` -> `process.exit(0)`。

## Validation
- `pnpm type-check`: pass
- `pnpm test`: pass
- `pnpm lint`: pass
- 手工 TTY 验证：
  - 菜单 `q` 直接退出
  - 菜单 `Enter` 入游戏 -> 游戏 `q` 回菜单 -> 菜单 `q` 退出
