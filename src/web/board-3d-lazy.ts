// 3D 渲染的懒加载边界：three/postprocessing/n8ao 与全部 board-3d 场景
// 代码都收敛在这棵 import() 子树下，菜单链路（2D canvas 预览）不引用它。
// app.ts 经 import('./board-3d-lazy.js') 触达——esbuild splitting 把它
// 切成独立 chunk，首次进关卡时才解码/装载。
import { createBoard3dRendererFactoryDeps } from './board-3d-renderer-factory.js'
import { createBoard3dRendererRuntime } from './board-3d-renderer-runtime.js'

import type { Board3dRendererRuntime } from './board-3d-renderer-runtime.js'

export const createBoard3dRenderer = (): Board3dRendererRuntime =>
  createBoard3dRendererRuntime(createBoard3dRendererFactoryDeps())
