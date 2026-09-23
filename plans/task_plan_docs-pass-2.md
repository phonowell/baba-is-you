# 文档整理/更新/淘汰（第二轮）

类型：docs maintenance
状态：进行中

## 核对结论（以工作区现行代码为准）

**已过时的声明：**
- `docs/logic-architecture.md` 阶段表仍是旧 12 阶段；现行 `step/phase-list.ts`
  为 **13 阶段**：`more` 前移到 interactions 之前（官方 block() 顺序）、新增
  `bonus` 阶段、`gravity` 移到管线末尾（fallblock 帧末语义）
- `docs/rendering-3d.md` 写 config 经 `board-3d-config.ts` re-export——该
  barrel 已在死代码清理中删除；缺 instancing（`board-3d-node-batches.ts`：
  实体卡/阴影贴片 InstancedMesh、you-rim `outlineAnchor`）、阴影贴图门控
  （`shadowMap.autoUpdate=false`）、ResizeObserver 视口；pixel-sprites 缺
  `index.ts`（注册表合并）、`recolor.ts`、`objects-official.ts` 由
  `src/tools/import-official-sprites.ts` 生成
- `docs/web-architecture.md` 缺启动惰性解析（`levelData` Proxy + menu 标题
  轻量扫描，`app.ts`）；file map 缺 `style.css`
- `docs/solver-handoff.md` 数字漂移：测试数 875→898；goldens 总数 329→333
  （顶层 `NNN-*.json` 250 个 campaign-bound + 顶层杂项 10 + 子目录 73）
- `docs/README.md` 索引描述仍写 "12 stages"
- `docs/level-data.md` 缺 `import-official-sprites.ts`（sprite 导入链）

**仍准确：** README×3（566 关/12 包/操作/词表/渲染/命令）、AGENTS.md
（工作区已同步 pixel-sprites/data）、deploy.md（DEPLOY_* 与 worker 门控
一致）、phase 同步三态/conditions/letter-words/empty 等主体章节

## 计划

- [x] 1. 更新 `docs/logic-architecture.md`：13 阶段表 + 排序理由改写
  （more 前置、bonus 尾段、gravity 帧末）+ file map 补 bonus/interactions
- [x] 2. 更新 `docs/rendering-3d.md`：instancing 渲染路径、阴影门控、
  ResizeObserver、file map 增删、pixel-sprites 新增文件与官方 sprite 导入链
- [x] 3. 更新 `docs/web-architecture.md`：惰性关卡解析一段、file map 补
  `style.css`；菜单补 solvable-first 排序
- [x] 4. 更新 `docs/level-data.md`：补 `import-official-sprites.ts` 一行
- [x] 5. 更新 `docs/solver-handoff.md`：刷新状态数字（900 tests 实测；
  campaign-bound 251 按 `levelIndex` 字段核对无误）
- [x] 6. 更新 `docs/README.md`：索引同步（13 阶段）、移除 clay 条目、
  plans 约定改写为「活跃期保留、落地后清理」
- [x] 7. 淘汰（用户已拍板）：删 `clay-style-research.md` + 47 个已完成
  task_plan + 2 个 notes（均为已提交文件，git 历史可找回）；
  8 个未跟踪计划保留——删除不可恢复，待随在途代码一并提交后再清理
- [x] 8. `pnpm lint`（0/0）+ `pnpm test`（900/900）验证

## 边界
- 只改文档，不动代码语义；工作区有大量在途未提交改动，避开 src
- plans/task_plan_*.md 历史约定见 docs/README.md；淘汰方式待用户拍板
- 不新写 AGENTS.md 未列出的平行文档
