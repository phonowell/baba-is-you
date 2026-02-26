# notes_level_select_and_import_audit

## Selection Feature
- `src/cli.ts`
  - 新增参数：
    - `--list-levels`：列出关卡并退出。
    - `--level N`：从第 N 关启动（1-based）。
    - `-h` / `--help`：显示帮助。
  - 兼容 `pnpm start -- ...` 传入的独立 `--` 参数。
- `src/view/input.ts`
  - 新增运行时切关输入：
    - `[` -> `prev-level`
    - `]` -> `next-level`
- `src/view/input.test.ts`
  - 新增输入映射测试。

## Metadata Audit Outputs
- `src/tools/audit-jeremy-level-metadata.ts`
  - 扫描 `../baba/levels` 全部 `.txt`（含 `index.txt`）并输出：
    - `plans/jeremy-level-meta-all-values.json`
    - `plans/jeremy-level-meta-values.md`
- 最新统计：
  - files scanned: 102
  - total metadata entries: 950
  - malformed entries: 0
  - multi-layer files: 5

## Activity Area Investigation
- 在官方解析实现中（`../baba/src/game.rs`）：
  - 地图宽度使用 `max(line chars) + right_pad` 计算。
  - 未使用 `left/top/bottom pad`。
  - `+ ... = ...` 仅用于 noun/text 颜色覆写。
- 在当前导入器中（`src/tools/import-jeremy-levels.ts`）：
  - `right pad` 已读取并加到宽度。
  - map 高度按分隔线后行数计算。
  - `+ ...` 被忽略（对本项目逻辑无影响）。

## Dimension Spot Check
- `0-baba-is-you.txt`: width=33 height=19 right_pad=11
- `1-where-do-i-go.txt`: width=24 height=19 right_pad=1
- `2-now-what-is-this.txt`: width=24 height=19 right_pad=1
- `1-the-lake/2-turns.txt`: width=28 height=17 right_pad=1
- 与导入结果中的 `Size` 一致。

## Remaining Import Gaps
- 多层地图（额外分隔线）仍未支持，当前会中断：
  - `1-the-lake/7-novice-locksmith.txt`
  - `2-solitary-island/10-wireless-connection.txt`
  - `2-solitary-island/11-prison.txt`
  - `2-solitary-island/extra-4-dim-signal.txt`
  - `2-solitary-island/extra-5-dungeon.txt`
