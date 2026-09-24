# 关卡准入（无 win + 地图不可达不准入，golden 豁免）+ 菜单关卡数=有 solution 数

## 目标
1. 主菜单顶部 `menu-count` 显示"有 solution（绑定 golden）"的关卡数，而非总关卡数。
2. 新增关卡准入：关卡没有任何获胜条件词（`win`/`end`/`done` 文本，或能拼出它们的字母单元）→ 不准入 campaign。
3. 继续收紧：源 `.l` 文件未被本 world 任何 `leveltype=1` 地图的 `[levels]` 条目引用 → 官方不可达 → 不准入；但同一布局有 golden 回放记录的关卡豁免（社区解法本身就是可玩性证据）。

## 结果
- 菜单数 = 251（绑定 golden 数不变——被剔关卡本无 golden），网格列全部 484 关。
- 语料 566 → 484：`missing-win` 剔 6 个 dev 测试房；`unreferenced` 剔 82 次（76 个净剔 + 与 missing-win 重叠 6）。
- golden 豁免 16 关：boilerworks、endless corridor、hidden relic、buried treasure、after hours(baba+museum)、getting together、x is y 2、cannon、another way、whoa、tunnel(328)、do it yourself、toy factory、compact、twisty ways。
- 剔除集中多为 dev/旧版副本——正式可玩版本在 museum 展区（同名如 `museum/276level` train、`museum/97level` baba fields）或已彻底废弃（如三个 fortress 变体全部未引用）。

## 已完成步骤
- [x] `src/logic/level-admission.ts`：`levelHasWinCondition`（复用 `step/win.ts` 的 `WIN_LIKE_PROPS`，已导出；字母单元按单字符覆盖 win/end/done 判定）。
- [x] `import-official-levels.ts`：`checkInitialCapability` 增 `hasWinCondition`/`signature`；新增 reason `'missing-win'`、`'unreferenced'`；新增 `collectMapReferences`（world 内 `leveltype=1` 地图 `[levels]` file 引用集）与 `loadGoldenLayoutSignatures`（`status:'win'` 回放的布局签名集）；`collectConvertedLevels` 增 `goldenLayouts` 参数，未引用且无 golden 覆盖 → `unreferenced`，有覆盖 → 记入 `exempted`。
- [x] 核实死地图无影响：baba 仅 208level(guest,0 条目)/338level(Null,仅链另一地图) 未引用，扁平引用即传递可达。
- [x] `pnpm import-levels:official` 重建（560 → 484，10 包）。
- [x] `goldens/**/*.json` 239 个 pin 重映射、12 个不变；0 个 pin 指向被剔关卡（pin ⇒ 签名匹配 ⇒ 自动豁免）。
- [x] `build-level-code-map.ts` 同步传入 golden 签名集重建（500 codes / 459 bound，bound 不变——官方代码只指向被引用文件）。
- [x] `renderMenuHtml`：`menu-count` = `hasSolution === true` 计数。
- [x] 测试：`level-admission.test.ts`（5 例）、`src/levels.test.ts`（语料不变量）、`render-menu-html.test.ts`（计数例）。
- [x] 文档：`docs/level-data.md`（两条准入规则 + 484）、`docs/web-architecture.md`（484）。
- [x] `pnpm check` 941 全绿；`pnpm build` 通过。

## 首轮步骤（missing-win gate）
- [x] 干跑管线：确认恰好剔除 227/263/276/291/393/513，其余 560 关顺序逐一对齐。
- [x] `pnpm import-levels:official` 重建（566 → 560）。
- [x] `build-level-code-map.ts` 重建（500 codes / 459 bound，自校验通过；被剔文件的同名他 world 副本不受影响）。
- [x] `goldens/**/*.json` 60 个 `levelIndex` pin 重映射（嵌入式签名前置自校验 + `goldens.test.ts` 后置校验）。
