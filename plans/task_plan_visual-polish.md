# 画面质感升级(IBL + GTAO + 氛围收尾 + 釉面材质,暗调聚焦)

## 目标
在现有黏土渲染基础上提升“高级质感”,整体调性转暗、聚焦棋盘:
- 环境反射(IBL):消除 Standard 材质的平光感,给出柔和高光
- GTAO:物体落地感、体素缝隙/接触线加深
- 后处理收尾:暗角 + 轻对比/饱和分级 + 静态颗粒(不动画,不新增 RAF)
- 材质升级:MeshPhysicalMaterial clearcoat 釉面 + envMapIntensity
- 暗色调性:背景/地面压暗,文字卡与体素更突出;轻雾拉开纵深

## 方案

### 预设与配置
- `clay-config.ts` `ClayPreset` 增加分组:`environment`(强度)、`ao`(radius/intensity 等观感旋钮)、`grade`(vignette/contrast/saturation/grain)、`materials` 增 `envMapIntensity/clearcoat/clearcoatRoughness/roughness`、`fog`(density)、`toneMappingExposure`
- `board-3d-config-postfx.ts`:GTAO 技术常量(采样数、分辨率比例、去噪参数)
- `board-3d-config-layout.ts`:地面/游玩区/网格/描边配色转暗调
- `board-3d-config-shadow.ts`:blob 阴影在暗地面上的颜色/不透明度回调

### 场景与管线(`board-3d-renderer-scene.ts`)
- `PMREMGenerator` + `RoomEnvironment` → `scene.environment` + `scene.environmentIntensity`;envRT/pmrem 句柄透出供 dispose
- 管线顺序:RenderPass → GTAO → Bloom → Bokeh → OutputPass → GradePass(最后,sRGB 域做暗角/分级/静态颗粒)
- `scene.fog = FogExp2(bg, density)`:密度极小,大盘远景轻雾
- 新文件 `board-3d-gtao-pass.ts`:GTAOPass 子类,`render()` 外包一层隐藏/恢复 `userData.gtaoExclude` 对象(纯函数 `suppress/restore` 可测)
  - 原因:GTAO gbuffer 用 MeshNormalMaterial override,无视 alphaTest → 字板透明区(emoji 字板几乎全透明)会产生方块 AO 光晕;排除后只让体素+地面参与 AO
- 新文件 `board-3d-grade-pass.ts`:ShaderPass 封装,uniforms 由 preset.grade 驱动;颗粒用静态 hash(随每次 render 采样,静止画面无闪烁)

### 材质(`board-3d-renderer-materials.ts` / `board-3d-ground.ts`)
- voxel/edge/front 材质 → `MeshPhysicalMaterial`:roughness 略降、clearcoat 釉面、envMapIntensity
- 地面/游玩区 Standard 材质补 `envMapIntensity`
- `board-3d-node-create.ts`:plate mesh 与 blob shadow mesh 打 `userData.gtaoExclude = true`(判定走 EntityVisual.key 前缀,避免 spec 回查)

### 生命周期
- `Board3dRendererScene` 返回 `environmentRT` + `pmremGenerator`;`disposeBoard3dRendererResources` 增加两者 dispose;`composer.dispose()` 已级联各 pass(GTAOPass.dispose 存在)
- 视口变化:`composer.setSize` 级联 GTAO setSize,无需额外接线

### 按需渲染约束
- 全部特性为“每次 render 的成本”,不引入常驻动效;颗粒静态、雾静态、IBL 一次性生成 —— RAF 语义不变

## 边界情况
- GTAO 排除仅影响 gbuffer,beauty 图不变;blob 阴影共面于地面,排除后无残留
- 暗背景下 bloom 阈值/强度需回调(文字 emissive 更亮);readabilityGuard 的 floor 逻辑不变
- emoji 字板几乎全透明 → 必须进 gtaoExclude,否则方块光晕
- `textEmissiveIntensity` 在暗场景可能需要上调,截图验证后定

## 测试
- gtao-pass:suppress/restore 纯函数对真实 Object3D 树的隐藏/恢复语义
- materials.test.ts:visual 材质为 Physical 且携带 clearcoat/envMapIntensity;既有缓存/dispose 断言不回退
- dispose:envRT/pmrem dispose 被调用(注入 fake)
- 不新增 RAF 断言(现有 runtime 测试已锁)

## 验证
- `pnpm check`(lint + type-check + test)
- `pnpm build` → release/baba-is-you.html 浏览器截图:暗角聚焦、釉面高光、AO 落地感、emoji 无方块光晕、文字可读
- 数值按截图迭代(preset 旋钮集中,调整成本低)

## 状态:完成(第三版:原神 NPR 方向)
- 管线(pmndrs postprocessing):RenderPass → N8AOPostPass → EffectPass(Bloom) → EffectPass(BrightnessContrast+HueSaturation+ToneMapping+Vignette)
- 材质:体素/字板/边/地面 → MeshToonMaterial + 共享 4 阶 gradientMap(cel 分阶);卡片仍用贴图+alphaTest
- 环境:IBL/PMREM 全拆(toon 不采样 env);场景背景 = 天空渐变 CanvasTexture(#4aa3e8→#cfe6f7),雾色取地平线色
- 灯光:AmbientLight → HemisphereLight(天蓝 #bcd8ff / 草地反弹 #7da860);暖阳平行光 #ffedc8
- AO:N8AO halfRes + 8 samples + 共享 depth texture(替代 GTAO 的第二遍场景渲染)
- 移除:tilt-shift 全链(原神游戏镜头无镜头模糊,边缘文字因此清晰)、GTAO/GradePass 自研 pass、gtaoExclude 机制、全部 PBR 材质旋钮
- 配色:地面 #4f9e45 / 游玩区 #7cc35f;saturation 1.1;vignette 0.08
- 测试:材质 toon 断言、dispose skyTexture;328 tests 全绿
- 截图:L1/L9/L10 三关确认——清晰无镜头模糊、文字卡可读、云朵 cel 分阶、无洗白
