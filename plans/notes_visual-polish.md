# notes: 画面质感升级

## 关键决策

- **GTAO 排除机制**:GTAO 的 G-buffer 用 `MeshNormalMaterial` override，无视 alphaTest → 字板(尤其几乎全透明的 emoji 字板)会投出方块 AO 光晕。方案:`EntityVisual.gtaoExclude`(plate→true, vox→false) → `node-create/sync` 写入 `mesh.userData.gtaoExclude` → `BoardGtaoPass.render()` 外包 suppress/restore。只动 `render()` 公开方法,不碰 `_overrideVisibility`(其 d.ts 与运行时命名不一致)。
- **blob 阴影也排除**:阴影 quad 与地面近平行,进 gbuffer 会在物体下多算一层假 AO,与贴图阴影叠加变脏 → 一并打 `gtaoExclude`。
- **GradePass 自写 Pass 子类而非 ShaderPass**:ShaderPass 不自清理且运行时字段是 `_fsQuad`(d.ts 写 `fsQuad`);`composer.dispose()` 只放共享 RT,不级联 pass → dispose 路径显式遍历 `composer.passes` 逐个 dispose。
- **IBL**:RoomEnvironment + PMREM 一次性烘焙,`scene.environmentIntensity` 全局强度 × 材质 `envMapIntensity` 局部强度,两者相乘。
- **颗粒是静态 hash**:不动画 → 不破坏按需渲染约束(RAF 不留守)。

## 调参记录(截图迭代)

| 旋钮 | 初值 | 终值 | 原因 |
|---|---|---|---|
| ambientIntensity | 1.6→1.05 | 0.55 | 暗调+IBL 叠加,首版全屏过曝 |
| topLightIntensity | 2.6 | 1.7 | 文字卡白块 |
| textEmissive | 0.42 | 0.3 | 卡片被 bloom 打成白块 |
| bloom.strength | 0.16 | 0.1 | 同上 |
| bloom.threshold | 0.9 | 0.95 | 只让最亮处泛光 |
| env.intensity | 0.6 | 0.45 | IBL 也贡献了亮度 |
| exposure | 1.18 | 1.1 | 整体收敛 |
| fog.density | 0.011 | 0.008 | 去雾感 |
| CELL_GRID_OPACITY | 0.38 | 0.2 | 网格线曾盖过棋子的尴尬 |
| PLAY_AREA_FILL | #2b3548 | #33405a | 游玩区与地面拉开 |

## 并行改动兼容记录
- `board-3d-renderer-view.ts` / `renderer-camera.ts`:并行分支重构了 bokeh 焦距(传 focusDistance 修复 ~4x 欠焦),补回 `BOKEH_INITIAL_FOCUS` 导入 + `let …: number` 标注(`as const` 字面量类型坑)。
- `board-3d-renderer-scene.ts`:并行分支加了 MSAA×4 HalfFloat composer target,补 `HalfFloatType` import。
- 工作区另有 `config-voxel`/`textures`/`voxel.ts`/`card-legibility` 计划在途,未动。

## 验证
- `pnpm check`:321 tests 全绿,lint 0,type-check 0
- `pnpm build` → release/baba-is-you.html 截图:L1/L5/L10 三关
- 确认:暗角聚焦、文字卡辉光、体素釉面高光、AO 落地感、emoji/字板无方块光晕、暗色 chrome 一致

## 全局暗色化(后续追加)
- `:root` 变量整体翻暗色板(bg #0d1119 对齐场景色、panel 三档、bubble/status 语义色、暗色阴影 = 微光顶缘 + 深投影),加 `color-scheme: dark` 让滚动条/表单控件跟随
- `body.game-3d-fullscreen` 的变量覆盖删除(已冗余),只留结构规则;`.btn` 全局改 1px border(暗色主题下阴影弱化,border 是主要可点击暗示)
- 硬编码浅色清理:toolbar bg、reference-backdrop 及斜纹、legend.syntax 琥珀色、menu-row.muted
- 截图复核:菜单屏、规则图例弹层、游戏屏 toolbar 均暗色一致

## 第三版:原神 NPR 方向(pmndrs 管线定型)

### 为什么换管线(性能账)
旧栈每帧 3 遍场景:RenderPass beauty + GTAO normal/depth + Bokeh depth,再乘 MSAA×4 HalfFloat + DPR1.4 → 用户报告"性能变差很多"。pmndrs `postprocessing` 的架构让所有需要深度的 effect 共享一份已解析 depth,N8AO 只采样不画场景;IBL/tilt-shift 拆除后每帧只剩 1 遍场景光栅化。

### 原神质感的技术映射
| 观感 | 实现 |
|---|---|
| cel 分阶 | MeshToonMaterial + 4 阶 DataTexture gradientMap([128,184,224,255],NearestFilter)——voxel/plate/edge/ground 共享单例 |
| 双色环境光 | HemisphereLight:天蓝 #bcd8ff 顶照 + 草绿 #7da860 反弹(云朵已呈现上白下蓝灰的二值分阶) |
| 天空 | 2×256 竖向渐变 CanvasTexture → scene.background;雾色取 sceneBackground #a8cfe0(地平线雾) |
| 暖阳 | DirectionalLight #ffedc8 ×1.75;半球光降到 0.72 拉开明暗对比 |
| 镜头 | 无 DOF/tilt-shift(原神游戏镜头不糊画面);vignette 0.08 弱收边 |
| AO | N8AOPostPass halfRes+8spp+depthAwareUpsampling——比之前全分辨率 GTAO(16spp+normal 重画+denoise)便宜一个量级 |
| bloom | 0.18 @ threshold 0.9:只打最亮的高光/描边 |
| grade | contrast 1.04,saturation 1.1(鲜活但不过艳) |

### 关键语义坑(记录防再犯)
- `HueSaturationEffect.saturation` 是**偏移量**:0=原样,+正增/-负减,不是乘数——正确接法 `preset.grade.saturation - 1`。BrightnessContrastEffect.contrast 同理为偏移语义。上版洗白主因仍是光预算+卡片高明度调色板,不是这俩参数。
- `MeshToonMaterial` 不认 roughness/metalness/clearcoat/envMapIntensity——`setValues` 对未知 key 只会 warn;材质 preset 已裁剪到只剩 emissive 两旋钮。
- pmndrs `EffectComposer.dispose()` 级联所有 pass/共享 RT;自建的 skyTexture 与 gradientMap 单例走 dispose 链路(disposeToonGradientMap 置 null,重建安全)。

### 遗留观察(未做,按需再议)
- 地面 GROUND_EXPANDED_MIN_SIZE=220 铺满视野 → 天空渐变与雾实际不可见,仅作背景兜底;若要露出天际线需缩地面或相机抬角,改动面大暂缓
- baba 白色精灵在亮底上略显单薄——sprite 资产层面的描边问题,非渲染层
- CSS 全局暗色 UI 保留(与亮场景搭配成立);若要亮色 UI 是独立改动

## UI 原神化(全局 CSS 第二版)
- `:root` 翻成亮色板:奶油面板 #f2ecdc、金边 #d3bc8e、深石板字 #3b4355、金色 accent #b8965a;`color-scheme: light`;阴影换暖色软投影(弃用暗色霓虹浮雕)
- `body` 加天空渐变(#9ec2dd→#cfe2ee→#e8efe4,fixed)——只露在菜单屏,游戏内被 canvas 盖住
- `.btn`:奶油底 + 金边,hover 金调;`.reference-header .btn`(Close)金边金字,避免融进同底色面板
- `.menu-row.selected`:金色渐变底 + 左侧金条 inset;hover 淡金底 + 深金字
- `.legend-text.syntax`:金色芯片(#e9dcb8/#6b5626);normal 芯片沿用浅蓝 bubble 变量
- 游戏内 toolbar:保留深色半透明 HUD 条 rgb(24 30 44 / 72%)(原神 HUD 本就是深透芯片),内嵌按钮改浅色玻璃芯片,status 文字改浅
- 弹层背幕:rgb(20 28 40 / 55%) 调暗 + 金/蓝斜纹
- 截图验证:菜单屏(天空渐变+奶油列表+金条选中)、游戏屏(HUD 条+浅色芯片)、图例弹层(奶油面板+金色节标题+syntax 金芯片)

## UI 原神化第三版(真实截图对照迭代)
用户反馈 v2「差远了」→ 实际抓取派蒙菜单/设置页截图对照分析，得出与记忆版的关键差异：

| 元素 | 真实原神 | v2 误区 | v3 修正 |
|---|---|---|---|
| 菜单行 | 羊皮纸胶囊行浮在场景底上 | 大面板包行的仪表盘 | 行改胶囊、去大面板 |
| 选中 | 金色 ◆ 菱形标记 + 金环提亮 | 左侧色条(不像) | marker 改 ◆(render-menu-html `&#9670;`)+ 金 glow |
| 节标题 | ◆ 金标前缀 | 纯文字 | `.section-title::before` ◆ |
| Close | 深藏青圆角 X 控件 | 奶油底金字(融底) | `var(--navy)` 深底米白字 |
| 背幕 | 藏青调暗 + backdrop blur | 平调暗 | `backdrop-filter: blur(3px)` |
| legend 芯片 | 胶囊 pill | 方角 chip | `border-radius: 999px` |

### 踩坑记录
- `body.game-3d-fullscreen .btn`(HUD 玻璃芯片，specificity 0,2,1)压过 `.reference-header .btn`(0,2,0)→ 藏青 Close 未生效;修法：Close 规则也挂 `game-3d-fullscreen` 前缀提高优先级。
- `aria-selected` 的 option 在 agent-browser 快照里可精确定位(`[selected, ref=eN]`)。

### 验证
- `pnpm check` 328 全绿 + `pnpm build`
- 截图：`/tmp/gi-ui-v3-menu.png`(◆ 金标选中行、胶囊行浮在天空渐变)、`/tmp/gi-ui-v3-dialog.png`(藏青 Close、◆ 节标、blur 背幕、胶囊芯片)

## 原神「神髓」校准(v4-v6):媒体/玩家调研驱动
用户反馈 v3「差得太远,没有神髓」→ 不靠记忆,抓官方分享/技术解析/玩家评价 + 3 张实机图校准。

### 调研结论(出处)
- **官方术语是 "stylised realism"**(GDC2021 蔡浩宇):不是纯卡通。渲染管线(miHoYo 技术 lead)目标词 "fresh, bright, clean",阴影要 soft edge feathering,3 种 AO 让物体 grounded
- **着色器还原研究**(bjayers):主 ingredient = 阴影边缘的人工 SSS——亮侧暖过渡+暗侧泛红,阴影带色相非压暗
- **深度评测**(gifpow):"smooth transitions between light and shadow zones"、环境是 "painterly/hand-authored textures"、bloom "aggressive…more Studio Ghibli"、远山 "fade into blue-tinted haze"
- **实机色板**(3 张官方截图):天青蓝(饱和!)、暖黄绿草、岩石受光暖米/背光蓝紫、绿松石水、远景融蓝雾

### 核心错位(方向做反了)
原神 = 画出来的世界 + 清晰赛璐璐角色;我们 = 硬 4 阶 toon 世界。环境该 painterly 不该 flat cel。

### v4-v6 落地项
| 项 | 实现 |
|---|---|
| 渐变地板提亮 | TOON_GRADIENT_STEPS 128→182(影面不再压黑,明暗比收敛) |
| 手绘地面 | createGroundMottleTexture:240→170 个椭圆大斑块(暖/鼠尾草/冷雾/深草)+细 speckle,CanvasTexture RepeatWrapping;plane/shape 两 mesh 各自 clone 设 repeat(世界 14u/块),dispose 补 map |
| 暖主光/冷辅光 | 右平行光改冷色 #a9c8ec ×0.3 不投影(原来双暖光对称洗平);左暖 key ×0.62;半球天光 #93baf0 加深(阴影染蓝)、强度 ×0.82→×1.0 |
| 配色 | 外草 #7ab858 / 游玩区 #98d463(同一片草甸两档)、描边改暖沙 #d8c98e(补缺失的暖色家族)、blob 影 #233a4a 冷绿 |
| 氛围 | fog 0.0075(板边融蓝雾)、bloom 0.34@0.82 仙气档、hemisphere ambient 1.05 |
| UI | 菜单画卷天空(天青顶+暖光晕+远草带)、弹层/菜单行细金内圈线、title letter-spacing 0.16em |

### 验证
- `pnpm check` 330 全绿 + `pnpm build`
- 截图:`/tmp/gi-v5-menu.png`(画卷天+◆金标)、`/tmp/gi-v6-game.png`(斑驳草甸+暖沙边+冷影)、`/tmp/gi-v5-l10.png`(密关:云朵二值分阶、baba 立正体素)

### 仍存的诚实差距(资产/结构层,非渲染层)
- 墙体深藏青是 baba 原作美术语言(原神世界没有这么暗的元素,但改色=改游戏身份)
- 俯视镜头看不到天空/远山,空气透视只能靠雾+边缘衰减表达
- 草地无植株/野花/水面等原神的色彩家族,只有单色草甸
- 像素字体 vs 原神衬线体——保留游戏自身身份,只用字距/装饰线提升
