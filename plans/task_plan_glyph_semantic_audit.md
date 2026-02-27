# task_plan_glyph_semantic_audit

- ✓ 1/4 全量审查：扫描 `OBJECT_GLYPHS` 并标记语义偏差项
- ✓ 2/4 批量替换：按更精确语义替换为全平台更稳妥 emoji
- ✓ 3/4 回归验证：运行 glyph 相关测试（重复值/fragile/覆盖）
- ✓ 4/4 类型验证：运行 `pnpm type-check`

## 约束
- 仅改 `src/view/render-config.ts`
- 保持 `OBJECT_GLYPHS` 无重复值
- 避免 fragile emoji 黑名单
