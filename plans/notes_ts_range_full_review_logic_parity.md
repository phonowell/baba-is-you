# notes_ts_range_full_review_logic_parity

## 假设
- 关卡文件定义为：`src/levels.ts` 与 `src/levels-data/**/*.ts`
- 非关卡 TS 文件均需满足 30-200 行（含测试与工具脚本）

## 决策
- 大文件优先按职责拆分：常量/类型/纯函数/流程分层
- 小文件优先同域合并：入口并入 CLI；同域测试合并
- 每轮修改后立即做行数复检与类型校验，避免连锁回归

## 风险
- 推测，待确认：官方逻辑细节以原始实现与现有测试双重校验；若资料缺失，采用可复现实验补充

## review-code-changes（全量 `src/**/*.ts`）
- 第1轮：✗最小化 `src/view/render.test.ts` 与 `src/view/input.test.ts` 出现重复按键映射用例；已去重
- 第2轮：✓真实性 ✓正确性 ✓优雅性 ✓最小化
- 第3轮：✓真实性 ✓正确性 ✓优雅性 ✓最小化

## Rust 官方逻辑复盘（`../baba/src/game.rs`）
- 轮次1（规则/阶段顺序）：对照 `game.rs:1097-1638` 与 `src/logic/step.ts`，阶段顺序一致：YOU移动 → MOVE → SHIFT → 重扫规则 → 朝向 → 变形 → 交互删除 → TELE → WIN
- 轮次2（移动核心）：对照 `game.rs:1176-1404` 与 `src/logic/step/move-single*.ts`、`src/logic/step/move-batch*.ts`，关键分支一致：push 先派生箭头、pull 正面阻挡、MOVE 翻转重试、WEAK 非 MOVE 阻挡时销毁、OPEN/SHUT 运动阶段互毁并触发 HAS
- 轮次3（多属性共存）：对照 `game.rs:1551-1578` 删除顺序与 `select` 浮层逻辑（`game.rs:1458-1483`），新增回归 `src/logic/step-parity.test.ts` 覆盖并通过：
  - YOU+WIN+DEFEAT 同体时优先败北
  - SINK 与 YOU/WIN 共存时占格触发删除
  - 多重删除原因下 HAS 仅生成一次
  - OPEN/SHUT 只按 `min(open, shut)` 成对消解

## 三轮连续结果
- 连续3轮未发现与 Rust 官方逻辑不一致点
