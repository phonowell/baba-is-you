# Task Plan — Solver Sweep & Golden Re-solve

Type: implementation
Status: in-progress

## Goal

1. 求解全部 566 个 campaign 关卡，产出 golden 存进 `goldens/` 并以 `levelIndex` 接入 campaign 关卡
2. 旧 84 个 fixture goldens 重解：replay 记录的输入拿到 waypoint 状态链，分段 BFS 重解，产出 `levelIndex` 格式新 golden（布局不一致/无对应的保留原样）
3. 边执行边优化求解算法

## Facts (verified)

- `src/logic/solve.ts`: bfs/greedy/astar/wastar/beam，visited = string stateKey，frontier node 存整串 `inputs`
- `src/tools/solve-levels.ts`: `--mod k/n` 分片、`--emit-goldens`、`--improve-goldens`、`--level`
- `goldens/`: 84 个旧 golden，`level:` 指向 `levels/**/*.txt` fixture（92 个 fixture）
- fixture→campaign: 74 布局一致，16 标题匹配但布局差异（多为 OLD 版），2 无标题匹配（BRIDGE BUILDING Q / BRIDGES Q）
- `goldens.test.ts` 校验 levelIndex↔levelData 或 level↔fixture 的 layoutSignature 一致性 + 全量回放
- 吞吐: step() ~25μs@67项 / ~400μs@226项；solve ~0.5–5k exp/s；旧解法长 8–385（中位~120）→ 盲搜 BFS 不可达，需 waypoint 引导
- `replayLevel` 返回逐步 `states`（精确 GameState），可做分段重解目标
- 机器: 10 核 16GB；sweep 用 `--mod k/N` 多进程分片
- `tools-out/` 已 gitignore

## Phases

### P1 solver 循环优化（`src/logic/solve.ts`，不动引擎语义）
- [x] bfs 不再计算 `winDistance`（FIFO 忽略 score）
- [ ] frontier node 改为 parent-pointer（`{parent, code, state}`），win 时回溯重建 inputs —— 消除 O(depth) 字符串拷贝
- [ ] 按 profile 决定是否优化 stateKey（数值编码 + 命中验证）
- 退出条件: `pnpm test` solve/goldens 相关测试绿 + 基准 exp/s 提升可测

### P2 waypoint 重解 + fixture 接入（tool 层）
- [ ] `solve-levels.ts` 增加 `--resolve-goldens <dir>`：逐 golden replay 取 states 链 → 稀疏 waypoint（每 W 步 + 末态）→ 段内 BFS（layoutKey 匹配，不含 turn）→ 拼接；失败段回退原输入；终验全量 replay 必须 win
- [ ] fixture→levelIndex 映射：归一化标题候选集 → 布局签名一致者优先 → 否则在各候选上 replay 原输入，win 者接入
- [ ] emit `goldens/NNN-slug.json`（levelIndex + levelData=campaign parse）
- 退出条件: 84 旧 golden 全部处理；能接入的都有 `levelIndex` 新 golden 且 `pnpm test` 绿

### P3 全量 sweep（后台分片）
- [ ] 8 分片跑 566 关 `auto`（bfs→wastar→beam 预算分配优化），emit 到 `tools-out/solve/goldens-run/`
- [ ] 合并产出到 `goldens/`
- 退出条件: 全 566 关有 outcome 记录；solved 的 golden 全部落盘且测试绿

### P4 improve + 收尾
- [ ] `--improve-goldens` 跑短解（<~60）证明/改进
- [ ] `pnpm check` + 更新 `docs/solver-handoff.md`
- 退出条件: check 绿，handoff 文档刷新

## Risks
- 深度 >~40 的关卡盲搜不可达 → waypoint 只覆盖旧 golden；无 golden 的长解关卡仍 `unknown`（如实报告）
- turn-seeded 关卡 waypoint 用 layoutKey（不含 turn），末验 replay 兜底
- 布局差异 fixture 接入需 replay 验证选对 variant

## 进度更新（续）

- [x] parent-pointer 节点 + push 侧 win 检测 + frontier 堆/队列重写
- [x] `--resolve-goldens`：waypoint 分段重解完成 —— 89 wired / ~78 shorter / 2 unwired / 1 fallback（见 resolve-*.log）
- [x] `auto` 级联 = bfs → macro → wastar → beam；新增 `macro` 策略（Sokoban 式决策粒度：泛洪可达 + 推/拉/走位宏，树上前缀共享 step()，贪心 winDistance 排序）
- [x] `prepareStep(state)`：step.ts 提取共享帧解析，兄弟展开省去重复 ruleRuntime+applyProperties（大板 ~18%/step）
- sweep: 8 分片起跑，因设备发热先后降为 4 → 2 worker（剩 shard 0、1 在跑）；被杀分片 2–7 断点 index ≈ 370/371/356/405/366/359，完成后按原 `--mod k/8` + `--skip-goldens` 续跑
- 注意：sweep 默认 `--max-depth 64`（步数上限）；macro 深度按决策数计，覆盖更长解；二轮对 cutoff 关用更高 depth

## 进度更新（三）

- [x] 修复 golden 接入误绑：`findCampaignIndex` 的 signature 命中以前直接短路、不验证回放——signature 不含 `dir`，老 fixture 无朝向与 campaign 满屏朝向 movers 撞签名（`3/7-0` 误接 level 61 并产出 `061-perilous-gang.json` 失败记录，已删）。现在 signature 命中只是候选顺序，必须 replay win 才算 wired
- [x] emit 防线：wired emit 只在最终 inputs 在所接关卡真实 win 时盖章 levelIndex；unwired emit 保留原记录的嵌入 `levelData`（否则漂移 fixture 会绑到旧棋盘的输入）
- [x] `3/7-0` 在嵌入旧棋盘上重解 128→110 并原地升级
- [x] step() 静态阶段表：`STEP_STAGES` 替代每步 12 对象 + ~36 闭包分配 → **step() 716μs → 247μs（2.9×）**，FIERY PIT 板
- [x] `prepareStep` 接入 solve 三处展开循环（beam/solveState/solveToLayout）
- [x] auto 级联阶段预算：bfs 0.3× / macro 0.8× / wastar 0.8× / beam 1×（bfs 前沿爆炸后边际极低）
- [x] macro 展开内按 stateKey 局部去重
- [x] 测试：solve.test +2（macro 走位/推箱），194 golden 全绿，635 全绿
- sweep：shard 0 done（solved=4 exhausted=4 cutoff=52 skipped=506）、shard 1 done（solved=1 exhausted=4 cutoff=51 skipped=510）；shard 2–7 由 `tools-out/solve/run-shards.sh` 顺序接力（单 worker 自动续跑，日志 `chain.log`）
- 约束更新：设备发热 → 此后**只跑 1 个求解进程**；已解关卡靠 `--skip-goldens` 跳过不重复演算
- exhausted 审计线索（见 handoff §6）：6 关疑似引擎缺口（MATRIX/COMBINATION LOCK/CLEAR VISION/47/ADVENTURE/JAYWALKERS UNITED），其余为过场卡本无可解

## 进度更新（四）— 官方移动碰撞/EAT 对齐

- [x] **move-time `eat`/`lock`/`weak` 官方对齐**（对照 `movement.lua` `check()`/`trypush()`/`move()`）：
  - `x eat y`：被吃目标 `valid=false` 永不阻挡（stop/pull/still/push 全无效）；门控 = 目标非 `safe` + 同 float 层 + 规则条件在**目标格**评估；被吃目标不进推挤/换位链
  - `x eat empty`：按格判定（该格 `empty is safe`/`empty is float`）
  - `open`/`shut` lock：同层 + 任一方非 safe 才触发，各自按自身 safe 判定死亡；mover 被同格其他障碍挡住时 **lock 不触发**（specials 只在 result==0 落地时执行）
  - `weak` 同层目标：不算 stop/pull 阻挡但仍可 push/pull；实体 weak 死亡仍在交互阶段（官方实体 weak special 是空操作）
  - `empty is pull` 挡普通进入、`empty is weak` 放行 —— `emptyBlocked` 三分支修正
  - `x has y` 掉落在 `delete()` 瞬间生成（`inside()` 内联），移动期 eat 会先掉落再进交互
- [x] 失效 golden 清理：旧投机性结算下录的 7 个 golden 删除（leaf-chamber×2、double-moat×2、main/starter-course、secure-cottage）——如 MAIN COURSE `rr` 依赖 eat 晚于 has-drop 的非官方时序
- [x] 社区解答复测新增验证：031 Leaf Chamber、101 Floaty Platforms、257 Power Generator
- [x] 测试：+8 个 eat/lock 回归（step-official-vocabulary + step-open-shut 断言改官方语义），767 全绿
- reshard-0b（shard 0 栈溢出重跑）跑的是修复前快照；其产出 golden 靠 replay 测试兜底，分歧的删了重解
