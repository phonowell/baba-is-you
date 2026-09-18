# task_plan_pixel-sprites

## 目标
- Web 3D 棋盘的物体卡片从 emoji 切换为自制 8-bit 像素贴图（24×24 ASCII 网格数据，存 TS 源码，无二进制资产）
- 新增全局帧动画系统：~300ms 低频定时器轮换材质贴图（原版为全图同步帧），不常驻 RAF

## 方案
- `src/web/pixel-sprites/`：类型 + 纯函数帧变换（wobble/mirror/rotate）+ blit + 注册表
- sprite 数据按主题分文件；`ensureFrames` 自动把单帧 sprite 派生为 3 帧（±1px 浮动）
- `CardSpec` 增加 `sprite`；`board-3d-textures` 按帧渲染 canvas（最近邻放大，透明底）
- 材质店登记 `material → frames[]`，`advanceSpriteFrames(nowMs)` 全局轮换 `material.map`
- runtime 挂接 `setInterval`（可注入测试），仅帧变化时 `needsRender` + `ensureFrame`
- `facingDirection === 'left'` 自动镜像帧；其余朝向沿用现有方向箭头
- 顺手修 factory `getMaterial` 吞掉 `overridden` 参数的 bug

## 步骤
- [x] pixel-sprites 模块骨架（types/derive/blit/index）
- [x] 纹理 + 材质店 + runtime 接线
- [x] 预览脚本 scripts/sprite-preview.ts（自带最小 PNG 编码器）
- [x] 分批绘制 70 个 sprite（creatures/terrain/objects/misc）
- [x] contact sheet 自查 + 修图迭代
- [x] 测试：registry 完整性、derive、blit、runtime 定时器、材质帧推进
- [x] pnpm check 全绿（307 tests）
- [x] 浏览器实机验证：关卡内 sprite 渲染正确（截图确认）

## 状态
完成。遗留：autotile（wall/fuse 邻居变体）、walk/face 多朝向帧、文字块像素字体 —— 均按 v1 范围刻意未做，按需再开任务。
