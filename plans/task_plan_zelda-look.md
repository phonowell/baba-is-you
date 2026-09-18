# 织梦岛风格改造:三方库重构管线 + 高调亮色 + 降本 AO

## 目标
- 性能:消除每帧 3 次场景重绘(GTAO normal/depth + bokeh depth),换回接近升级前的帧成本
- 风格:暗调聚焦 → 塞尔达·织梦岛高调清新搪胶(亮绿草地、暖阳、软阴影、釉面高光、tilt-shift 带状景深)
- 约束:优先用成熟三方库,不自研 pass;保持按需渲染、dispose 完整、可测试

## 库选型(已调研)
- `postprocessing@6.39.5`(pmndrs):EffectComposer 内建 `multisampling:4` + `frameBufferType:HalfFloatType`;`needsDepthTexture` 声明式共享稳定深度(每帧一次 blit 拷贝,所有 pass 复用);`dispose()` 级联全部 pass/buffer
- `n8ao@2.0.1`:`N8AOPostPass` 直接采样共享深度重建法线,**零场景重绘**;`configuration.halfRes` 内建半分辨率;alphaTest 物体天然无方块光晕(透明像素不写深度)→ `gtaoExclude` 机制整体删除
- `TiltShiftEffect`:屏幕空间带状模糊 = 织梦岛招牌;KawaseBlur 半分辨率,比 DepthOfField 便宜且不需要焦距追踪 → 移除 bokeh 焦距机制

## 新管线
```
RenderPass → N8AOPostPass(halfRes+8samples)
→ EffectPass(Bloom + TiltShift)          // HDR 图像操作
→ EffectPass(Contrast + Saturation + ToneMapping(ACES) + Vignette)  // 收尾输出
```
- `renderer.toneMapping = NoToneMapping`(pmndrs 惯例,ToneMappingEffect 收尾)
- 深度共享:composer 自动注入 `stableDepthTexture`

## 修改
- `n8ao.d.ts`(新):ambient module 类型(n8ao 无 d.ts)
- `clay-config.ts`:`bokeh→tiltShift{offset,focusArea,feather,blur}`;`ao→{radius,intensity,distanceFalloff,halfRes,samples}`;`grade` 去掉 grain/vignetteEnd;`toneMappingExposure` 删除(亮度走灯光);readability 的 aperture/maxBlur floor → `tiltShiftOpacityFloor`;整套高调值
- `board-3d-renderer-scene.ts`:pmndrs composer 装配
- `board-3d-renderer-view.ts`:`bloomPass.strength→bloomEffect.intensity`;bokeh uniform 组 → `tiltShiftEffect.blendMode.opacity` lerp;移除焦距追踪;`composer.setSize` 改 pmndrs 签名(无 setPixelRatio,DPR 走 renderer)
- `board-3d-renderer-camera.ts`:删 updateBokehFocus 与焦距计算
- `board-3d-renderer-factory.ts` / `runtime.ts` / `dispose.ts`:composer 类型换 pmndrs;dispose 简化为 `composer.dispose()`(级联)
- `board-3d-renderer-materials.ts` + `node-create.ts` + `node-sync.ts`:删 `EntityVisual.gtaoExclude` 与 userData 写入
- 删除 `board-3d-gtao-pass.ts`、`board-3d-gtao-pass.test.ts`、`board-3d-grade-pass.ts`
- `board-3d-config-layout.ts`:亮绿地面板(playArea 更亮一档)
- `board-3d-config-shadow.ts`:阴影色 → 深暖绿、降不透明度
- `style.css`:`.board.board-3d` 底色跟随新场景色(chrome 保持暗色,与亮画面形成画框对比)
- 测试更新:dispose(级联断言)、clay-config(新值+光预算)、materials/card-facing(删 gtaoExclude)

## 验证
- `pnpm check` + `pnpm build`
- 截图 L1/L5(GRASS YARD 对标参考图)/L10:亮绿高调、釉面高光、tilt-shift 带、AO 落地、文字可读
- 帧成本对比:场景重绘 3→1 + 深度 blit 1 次

## 状态:进行中
