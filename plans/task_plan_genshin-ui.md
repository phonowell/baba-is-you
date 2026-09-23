# UI 质感升级：原神式高贵典雅

## 现状诊断（截图确认）
- 全部 UI 用 Courier New 等宽体 → 读作"开发者工具"，是最大短板
- 菜单关卡格像计算器按键：厚重投影、等宽数字
- 预览面板只有一个裸深色井，无画框感
- 结算卡/规则弹窗配色已对，但字体与细节装饰不足

## 方案（CSS 为主，不动 DOM 结构）
- 字体双轨：`--font-display` 优雅衬线（Palatino/Georgia/宋体回退）用于标题/数字/规则；`--font-ui` 人文无衬线用于正文/HUD
- 菜单：标题衬线+金色光晕；背景加暖色顶光与暗角；格子瘦身（细金线+衬线数字+选中金匾脉冲）；预览面板加金线框+顶部◆铆饰+衬线斜体图注
- HUD：工具栏加金色发丝顶边；状态文改无衬线字距
- 弹窗：结算卡内描金线框+标题两侧发丝线+主按钮金底；规则标题衬线、规则条衬线
- 约束：全部 CSS/静态装饰，无新增 RAF；`menu-preview.ts` 卡片字仍用 Courier（模拟游戏内像素字卡），仅修注释

## 验证
- `pnpm check`
- `pnpm build:fast` → 浏览器截图对比菜单/对局/弹窗

## 状态：已完成（2026-09-23）
- style.css 全部落地；menu-preview.ts 仅注释更新
- `pnpm test` 875 全过；`pnpm build:fast` 产物 619 KiB
- 截图验证：菜单衬线标题+金框预览+◆铆饰；HUD 金发丝边；结算卡衬线标题+双侧发丝线+内描金框+金底主按钮；规则弹窗衬线条文
- 已知阻塞（非本任务）：`pnpm check` 的 type-check 挂在并行 WIP `src/web/pixel-sprites/recolor.ts:96`（TS2542），未触碰

## 第二轮（"更像游戏"）：材质厚度 + 氛围活性
- 标题改烫金渐变字 + 慢速流光扫过（background-clip:text + drop-shadow 投影）
- 标题上方加 ✦ 徽饰；菜单背景加星尘漂移层（translate3d 合成器动画，110s）
- 全部格子统一釉面：顶部高光 ::before + 底部暗边；选中金匾叠加更强高光
- 悬停改 translateY(-2px) scale(1.04) + 金光晕，更像可按压物件
- 预览面板四角加描金 L 括线（8 条 linear-gradient 细杆）+ 对角玻璃光
- 预览画布内嵌暗边；结算卡顶部暖光池 + 顶部 ◆ 铆钉；规则弹窗同铆钉
- 按钮/kbd 键帽加底部暗边（糖果立体感）；工具栏改上下渐变
- 截图复核：菜单/对局/结算全部通过

## 第三轮：HUD 信息架构 + 手绘纹样
- 工具栏左端加常驻"关卡铭牌"（.level-badge：菜单编号金色衬线 + 斜体关名，玻璃小金牌）— GameViewUpdate 增 levelMenuNum，app-draw 经 levelMenuNumber 注入
- 结算卡标题下发丝线升级为 SVG 描金藤蔓饰（.outcome-ornament：卷草端头+中心菱形+端点圆珠，data-URI 无请求）
- 结算 backdrop 加舞台暗角（radial-gradient，pointer-events 仍穿透）
- 预览图注居中
- type-check/测试全绿（并行 WIP 已收敛）；build:fast 通过；三屏截图复核

## 第四轮：规则从弹窗拆出 → 棋盘透明 HUD
- `.board-wrap` 内新增 `<aside class="rules-hud">`（半透明藏青玻璃 + 描金边 + backdrop blur，pointer-events:none 不挡棋盘输入；forced-landscape 下吃 safe-area 偏移）
- `update()` 每回合重绘规则行，复用 `renderRules`/`renderRulesListHtml`（原 `renderReferenceRulesHtml` 改名，不再服务弹窗）；新增规则打 `.rules-fresh` 闪光，消失规则转 `.rules-ghosts` 删除线幽灵行 ~1.1s 淡出
- 无规则且无幽灵时 HUD `hidden`；弹窗瘦身为纯 Controls（键盘/触屏/手柄三栏），按钮文案与 aria-label 同步改 "Controls"；死样式 `.rules-list` 删除
- 新增 `src/web/app-game-view.test.ts` 3 例：HUD 在 board-wrap 内且弹窗无 rules-list、消失规则转 ghost 且 HUD 保持可见、空规则时 HUD 隐藏
- 浏览器 DOM 探针确认：HUD 四行规则可见、弹窗仅剩 Controls/Touch/Gamepad；回放期间规则未变属预期（该关解不破坏规则）
- 已知无关失败（并行 sprite WIP）：`pixel-sprites.test.ts` cake frame 24x25 超格，非本任务改动（后已收敛，pnpm check 全绿）

## 第五轮：全界面动效增强（"游戏质感"核心一轮）
- **节奏重分层**：入场 240-520ms + 回弹曲线（cubic-bezier overshoot），微交互保持 100-170ms；环境层秒级循环
- **模式转场**：`::view-transition-old/new` 从被阉割的 100ms 改为 240/360ms 溶解+缩放沉降（旧屏下沉、新屏轻抬落定）；in-place 选择更新不走快照
- **菜单**：格子悬停改 170ms 回弹 transform + `:active` scale(0.94) 按压；选中牌 `plaque-land` 落牌闪光 + 修复 `.menu-enter` 下 plaque-glow 被入场 shorthand 永久覆盖的死 bug（新增 `.menu-enter .menu-cell.selected` 双动画声明）；预览切换 `preview-swap` 翻页动效（app-draw 重触发 class + reflow restart）；grid `scroll-behavior:smooth`；✦ 徽饰 crest-bob 浮动；星尘层加透明度呼吸
- **对局**：棋盘 `board-in` 480ms 相机沉降（scale 1.03→1 + 淡入）；工具栏 toolbar-in 加 70% 过冲回稳；关卡铭牌 `badge-in` 延迟弹出；规则 HUD `hud-in` 左缘滑入（unhidden 时重播）；新规则 rule-in 补金色光晕
- **弹窗**：dialog-in 55% 过冲帧 + 340ms；backdrop 240ms；controls 行 `row-in` 级联 120-320ms 阶梯
- **结算卡**：独立 `outcome-in` 460ms 升起回落 + `verdict-in` 字距收紧/去模糊"判词盖章" + `ornament-in` 纹样中心展开 + 按钮 `btn-in` 逐个弹出（300-480ms 阶梯）+ primary `primary-breathe` 呼吸光（注意 nth-child 特异性需 `.outcome-actions .outcome-btn.primary` 才能盖过行延迟）
- **按钮**：hover translateY(-1px) 浮起、:active scale(0.96) 按压；status 颜色 320ms 过渡
- 约束保持：全部 keyframes/transition，`prefers-reduced-motion` 一刀切仍生效；无新增 RAF
- 浏览器探针验证：各元素 computed animationName 全部命中（hud-in/board-in/toolbar-in/badge-in/dialog-in/row-in/outcome-in/verdict-in/ornament-in/btn-in+primary-breathe/crest-bob/preview-swap）；截图复核

## 第六轮：3D 棋盘动效强化 + 规则卡状态反馈
- **logic**：`GameState`/`RuleRuntime` 新增 `activeTextIds`（参与激活规则的文字卡 id 集合），与 `overriddenTextIds` 同源自 `textRuleMarksFromPartition`；`createInitialState`/`step` 全链路携带，`resolveStepFrame` 快路径同时校验两集合；rules-override.test 补三处平行断言（含"not 修饰词不是规则源格"语义）
- **规则卡反馈（web/3D）**：`NodePulseKind` 扩展 `rule-on`/`rule-off`；`EntityNode` 新增 `ruleActive`/`ruleOverridden`/`ruleFxDone`；sync 层对每卡做激活/否决成员 diff——进规则弹 `rule-on`（小跳+拉伸）配金色星环粒子，出规则/被否决弹 `rule-off`（塌陷 squash）配灰色尘点，被解否回弹 rule-on；同帧多卡按视图序 55ms 错峰扫过；首次挂板静默、despawn 中跳过、无变化不重触发
- **常驻点亮面**：`cardSpecForItem` 第 4 参 `active` → `text:active:*` 规格（亮羊皮纸+全强度金 keyline+暖墨字，语法词保留 ◆）；`getVisual`/`visualKeyForItem` 透传，sync 让激活卡即时换面；menu-preview 同步点亮；被否决卡永不点亮（overridden 分支优先）
- **既有动效幅度调强**（board-3d-config）：SPAWN 230→280ms/ROLL_IN -0.38→-0.5/垂直偏移 0.16→0.2；DESPAWN 170→200ms/SPIN 0.55→0.7；JUMP 0.17→0.22、MOVE_STRETCH/SQUASH 0.17/0.14→0.2/0.16、ROLL 0.18→0.22、LANDING 0.04→0.055、LAND_MS 125→140；IDLE_STRETCH 0.035/0.014→0.05/0.02；FLOAT_BOB 0.07→0.09、FLOAT_ROLL 0.05→0.07；PULSE_HOP 0.34→0.4/SLUMP 0.3/0.14→0.32/0.16
- **测试**：card-facing.test 新增 3 例（激活边界 pulse 装备/不重复/静默入场、三卡 55ms 错峰、rule-on 跳升 vs rule-off 塌陷姿态）；runtime.test 新增规则粒子错峰单次触发例（effects stub 补 ruleSparkle/rulePuff）；board-3d.test 新增点亮面 spec 断言
- **修到的一个真 bug**：`nextState` 漏写 `activeTextIds`（spread 继承旧集合）——step 后激活标记停在上一帧；测试先行暴露
- `pnpm check` 全绿（883 tests、lint 0、type-check）；build:fast 636 KiB；浏览器复核：Lv2 规则列暖金点亮 vs 游离卡素面，方向键移动正常

## 第七轮：棋盘 HUD 去容器底
- `.rules-hud` 去掉整块藏青玻璃面板（background/border/box-shadow/backdrop-blur/padding 全撤）——容器零底色；每行规则自己背玻璃 chip（`rgb(18 26 38 / 55%)` + blur(6px) + 金色左缘 + 轻投影），ghost 行配 42% 暗 chip，标题裸字加 text-shadow 兜底可读性；底部 mask 溶解保留
- `.game-toolbar` 同样拆容器：`72%` 藏青渐变 + blur + 金发丝顶边全撤——底栏零底色；status 提示文改裸字（`#e9edf2` + 双层 text-shadow），`.level-badge` 与 `.btn` 各自升级为藏青玻璃 chip（55% 底 + 金边 + blur，hover 加深至 72%）——整个棋盘 HUD 统一成"裸容器 + 独立小件"的 Genshin 式漂浮语言
- 验证：computed style 确认容器 `rgba(0,0,0,0)` 无 border；截图复核规则区与底栏均只剩小件漂浮在棋盘上

## 第七轮补：对象实体的属性变化反馈
- 问题：rule pulse 只覆盖文字卡——`wall is stop` 拆掉时 wall/is/stop 文字在响，但真正失去 `stop` 的 wall 实体完全静默
- `EntityNode` 新增 `propSig`（排序后 props 签名）；sync 对全部实体做 prop-set diff：获得属性 → `rule-on` 弹起+金星环，失去 → `rule-off` 塌陷+灰尘，同尺寸交换算获得（新性质是新闻）；规则边界 diff 优先于 prop diff；乱序同集合不误报
- `RULE_PULSE_STAGGER_MAX_INDEX: 12` 给错峰上限——群体事件（30 面墙）仍逐卡扫过但不拖 1.65s 尾巴
- 测试 +2：三墙群体 rule-off→rule-on 回合、乱序不误报/同尺寸交换弹 rule-on；885 tests 全绿
- 实测 Lv41 "A PRESENT FOR YOU"：两步推断 BOX IS PUSH → HUD ghost 行淡出 + box 实体 sag + PUSH 卡换回素面，全链路生效

## 第九轮：粒子效果全面加强（用户反馈"既不明显又弱"）

- **根因**：粒子是 1×1 平面缩到 0.065–0.105 世界单位（≈格子的 7–10%），整屏只有 4–6px；spawn puff 用卡片自身色，墙绿粒子落在绿草上对比度趋零
- **尺寸**：全部 ~1.6–2x——spawn 0.085→0.16、despawn 0.105→0.17、ruleSparkle 0.07→0.13、rulePuff 0.065→0.11、win 0.1→0.16、lose ash 0.075→0.12
- **数量**：spawn 6→9、despawn 11→15、sparkle 9→13、puff 6→9、win 16→24、ash/点 5→7；`PARTICLE_MAX` 240→360（错峰入场同屏 puff 不触发回收）
- **能量/寿命**：横向速度 +30–45%、上抛速度上调；寿命 spawn 380→460ms、despawn 520→640、sparkle 460→560、puff 420→520、win 1050→1250、ash 1500→1800
- **可读性**：`PARTICLE_FADE_START` 0.62→0.72（粒子大半程保持实心）；spawn puff 新增 `SPAWN_PUFF_WHITE`/`RATIO:0.4` 混白（对齐 despawn 手法）；lose/rulePuff 灰阶提亮一档保持灰系语义
- **顺手修**：`node-sync` prop-diff 的 `includes` 窄类型错误（并行 WIP 收窄 `Item.props` 后暴露）改双向 Set 比较；card-facing 测试夹具 props 标 `Property[]`
- 验证：lint 0/0、board-3d 相关 60 tests 全绿、build:fast 通过；浏览器抢帧确认入场 puff 亮白方块清晰可读
- 遗留：`pnpm check` 的 test/type-check 挂在并行 replay-confirm WIP（`isReplayConfirmOpen`/`showReplayConfirm` 新必填字段）与 pixel-sprites bat 帧，均非本轮改动
