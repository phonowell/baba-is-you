# task_plan_clay_atmosphere

- ✓ 1/4 地面纹理：在 `src/web/board-3d.ts#createGroundTexture` 增加颗粒/手作噪声
- ✓ 2/4 环境雾层：在 3D 场景增加轻雾参数，统一整体色调
- ✓ 3/4 尘粒层：增加轻量静态尘粒层，增强模型台氛围
- ✓ 4/4 验证：运行 `pnpm lint` 与 `pnpm type-check`

## 约束
- 仅改 `src/web/board-3d.ts`
- 不改 `src/logic`
- 不新增运行时 preset 切换
