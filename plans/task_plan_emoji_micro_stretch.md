# task_plan_emoji_micro_stretch

- ✓ 1/4 定位 `src/web/board-3d.ts` 中 emoji 判定与动画主循环（`isEmojiItem`、`applyNodePose`）
- ✓ 2/4 设计并接入 emoji 微弱上下拉伸参数：周期 1s、底部锚点、不影响非 emoji 与现有位移动画
- ✓ 3/4 增补或调整测试，覆盖新增动画函数/关键约束
- ✓ 4/4 运行 `pnpm type-check` 与针对性测试并确认结果

## 风险
- 推测，待确认：当前 3D 动画未暴露可直接单测的函数，可能需要抽取纯函数后再测试。
