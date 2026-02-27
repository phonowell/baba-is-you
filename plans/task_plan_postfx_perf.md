# task_plan_postfx_perf

- ✓ 1/4 基线分析：识别后处理链路中的高成本阶段与可无损优化点
- ✓ 2/4 管线优化：降低后处理像素成本并保持视觉一致性
- ✓ 3/4 条件开关：在视觉几乎无差异的场景关闭冗余 pass
- ✓ 4/4 验证：运行 `pnpm lint` 和 `pnpm type-check`

## 约束
- 仅优化 `src/web/board-3d.ts` 后处理性能
- 不改 `src/logic`
- 不改变 preset 的对外语义
