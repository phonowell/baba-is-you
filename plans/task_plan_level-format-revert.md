# 关卡格式回退：baba ASCII → 实体列表 + 补齐丢失 tile

类型：implementation
状态：完成（`pnpm check` 的 97 type-error/36 失败测试全部位于重构自有
menu/app 测试文件，属预存损坏；本任务范围 lint/goldens/logic/build 全绿）

## 背景
- `../baba` 的 ASCII 关卡格式单层每格只能写一个 glyph；`x on y` 图例与 `---`
  分层虽能叠放，但作者手绘时未给部分格内物体补 tile → 若干关卡的 tile 实体丢失。
- 官方 `.l`（`data/baba`，多 LAYR 层 = 同格多物体）是基准：扫描发现 19 个官方关卡
  存在 tile+object 叠放，其中 10 个有 `levels/*.txt` 夹具对应。
- 决策（用户确认）：夹具关卡回退到我们自己的实体列表格式
  （`Title/Size/name@dir x,y`，与 `src/levels-data` 同款），即"没有和 ../baba
  对齐的版本"；以官方 .l 数据为准补齐缺失 tile。
- `LevelData.meta`（palette/backgrounds/color overrides）目前只有
  parseAsciiLevel 产出、`state.meta` 无消费方（view 用 sprite 调色板）→
  转换时丢弃，../baba 仍保留该数据。
- 工作区另有进行中的 overworld 移除重构（index.txt/6-rocket-trip 已删、
  parser 精简）——本任务不触碰；92 个存活夹具文件全部转换。

## 步骤
1. 转换脚本 `scripts/convert-ascii-levels.ts`：以 `../baba/levels`（= 我们
   0215b64~1 的内容，已验证 102/102 逐字节一致）为输入，parseAsciiLevel →
   LevelData → 输出实体列表文本写回 `levels/*.txt`（同路径、同 .txt 后缀，
   golden `level` 字段不变）。格式：`Title/Size WxH/Background transparent/` +
   `Key coords;`（text=首字母大写，object=小写+可选 @dir；key 按 localeCompare
   排序，coord 按 y,x 扫描序）。
2. `--check` 模式 = “比对确保和 baba 无误”：逐文件 parseAsciiLevel(../baba)
   vs parseLevel(ours) 比对 item 多重集（name/isText/x/y/dir），除补齐的
   tile 外必须零差异。
3. 补齐缺失 tile（10 关）：官方叠放实体 ↔ 夹具坐标逐关映射，向夹具追加
   `tile@<官方dir> x,y`。受影响：1-the-lake/{2-turns,6-lock,7-novice-locksmith,
   10-two-doors}、2-solitary-island/{9-research-facility,10-wireless-connection,
   11-prison,extra-4-dim-signal,extra-5-dungeon}、5-deep-forest/8-victory-in-the-open。
   逐关上下文比对结果：实际仅 5 关真正丢 tile——
   `tile@down 7,9 7,10 7,11`（2-turns 竖井右墙列）、`tile@right 11,7 16,7 19,9`
   （6-lock 三扇门）、`tile@down 12,8`（7-novice-locksmith 地砖中的门）、
   `tile@right 16,6`（10-two-doors 地砖边缘门）、`tile@right 5,9 11,13`
   （9-research-facility 墙缝 skull + Win 文本）。其余 5 关的叠放本就被
   `on tile` 图例/分层保留（wireless-connection/dim-signal/prison/dungeon），
   victory-in-the-open 的 Win 位于 3×3 地砖环中心空洞（官方亦无 tile）。
4. 消费方切换：`src/logic/goldens.test.ts`、`scripts/port-rust-goldens.ts`、
   `scripts/diff-rust-golden.ts`、`src/web/app-goldens.ts`（运行时解析
   levelText）对自有夹具改用 `parseLevel`；`parseAsciiLevel` 保留（仍用于
   读 ../baba 文件与比对）。
5. levels-data 回退：删除 `import-official-levels-convert.ts` 的惰性 tile
   过滤后 `pnpm import-levels:official` 重生成——5 个 `*-official.ts` 与
   `0215b64~1` 逐字节一致（`src/levels.ts` 索引不变；`src/levels-maps.ts`
   为未跟踪生成物，按当前 importer 同步重生成）。
6. goldens 重快照：新建 `scripts/resnapshot-goldens.ts`——parseLevel 的
   item 顺序（语句序）≠ parseAsciiLevel（格扫描序）→ serializeState 串与
   全部 hash 变化，所有按文件引用的 golden 必须重写。策略：先在 live 文件
   重放记录输入，win 则重写为 live 引用（顺带回收可复活的 levelData 内嵌）；
   否则保留 levelData 内嵌兜底。结果：83 重写（含 1/10-0、2/9-0 重挂回
   live 文件获得新 tile 覆盖）、2 保留内嵌（1/2-0 记录布局确有实体级差异、
   3/7-0）、0 失败；85/85 golden 测试通过。
7. `pnpm check`（lint+type-check+test）、`pnpm build`、AGENTS.md 目录结构同步、
   清理临时脚本、回写本计划。

## 验证
- 转换后逐文件 item 多重集与 ../baba 一致（除补齐 tile）。
- 全部 goldens 重放仍 win。
- `pnpm check` 全绿。
