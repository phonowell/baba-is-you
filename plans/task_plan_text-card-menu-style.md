# 文本卡对齐主菜单 UI 特色

状态：完成。`pnpm check` 绿（351 tests），`pnpm build` 成功；ORB 关截图确认奶油胶囊卡面、金发丝 keyline、syntax 卡 ◆ 金标均生效。

## 目标
3D 棋盘上的规则词石板（text plate）换用主菜单的视觉语言：
- 羊皮纸胶囊面：竖向渐变（顶亮底暖），替代平涂
- 内侧金发丝 keyline：沿圆角石板边缘的细金描边（菜单行 inset keyline 的移植）
- ◆ 金标：syntax 词卡顶部 keyline 上镶小菱形（menu-flourish 的移植）
- 调色板收敛到菜单家族：cream / gold / navy / slate

## 语义映射（沿用现有 noun/syntax/overridden 三类）
- 名词卡（BABA/WALL…）= 菜单行奶油胶囊：`#f8f2e2 → #e2d7bd`，slate 墨 `#3d4757`
- 语法词卡（IS/AND/NOT…）= 金调高亮：`#f6e5b4 → #dcb97a`，深金墨 `#513c0c`，更强 keyline + ◆
- 被否决卡 = 藏青暗化（菜单深色件）：`#3d4757 → #2e3c50`，暗金 keyline，红 X 不变
- sprite 物体卡不变；无 sprite 物体卡保持平涂（不新增 pill chrome）

## 改动面
- `src/web/board-3d-shared-types.ts`：CardSpec 增加 `backgroundTop` / `keylineColor` / `diamondColor` 可选字段
- `src/web/board-3d-config-visuals.ts`：文本卡三色板重写为菜单色板
- `src/web/board-3d-shared-item.ts`：三类文本 spec 接新字段
- `src/web/board-3d-config-textures.ts`：keyline/◆ 几何常数
- `src/web/board-3d-textures.ts`：渐变面 + keyline 路径（半径沿用石板圆角）+ ◆ 绘制
- `src/web/board-3d.test.ts`：锁定 类别→chrome 映射（syntax 才有 ◆；物体卡无 pill 字段）

## 验证
- `pnpm check`
- `pnpm build` + agent-browser 截图复核关卡内文本卡观感
