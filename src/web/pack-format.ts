// 打包 payload 格式的单一事实源：构建脚本（scripts/build-single-html.ts）
// 用来编码与重写模块说明符；产物内联 loader 把这些函数体经 toString 注入
// 后解码、装载。因此本文件的函数只允许引用全局对象与字面量，或本文件内
// 的其它导出（注入时按名同域可见）——不得触碰模块作用域变量。

// fnv1a：部署构建用它把「盐|主机名」折成种子掩码。
export const fnv1a = (text: string): number => {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

// 密钥流：每个 payload 从头派生，XOR 逐字节掩码。不是加密——只是让产物
// 里不出现标准 gzip 字节流，提取必须先复现派生逻辑。
export const createKeystream = (seed: number): (() => number) => {
  let state = seed >>> 0
  let word = 0
  let left = 0
  return () => {
    if (left === 0) {
      state = (state + 0x6d2b79f5) >>> 0
      let t = state
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      word = (t ^ (t >>> 14)) >>> 0
      left = 4
    }
    left -= 1
    const byte = word & 0xff
    word >>>= 8
    return byte
  }
}

// XOR 对称：编码（gzip 后）与解码（gunzip 前）共用同一函数。
export const applyPackKeystream = (
  bytes: Uint8Array,
  seed: number,
): Uint8Array => {
  const next = createKeystream(seed)
  return Uint8Array.from(bytes, (byte) => byte ^ next())
}

// esbuild minified ESM 产物里的模块说明符形态：
//   import { x } from"./a.js" / export { x } from"./a.js" / import"./a.js"
// 与动态 import("./a.js") 互不重叠（动态形态紧跟括号，静态说明符不含括号）。
export const PACK_DYNAMIC_IMPORT_RE =
  /import\s*\(\s*["']\.\/([^"']+)["']\s*\)/g
export const PACK_STATIC_IMPORT_RE =
  /(?:import|export)\b[^();]*?\bfrom\s*["']\.\/([^"']+)["']|import\s*["']\.\/([^"']+)["']/g

// 把一个 chunk 源码里出现的相对说明符（'./x.js'）按其所在文件位置归一成
// payload 名（outdir 相对路径）：入口在根、共享 chunk 在 chunks/ 下。
export const resolvePackDep = (
  importerName: string,
  spec: string,
): string => {
  const dir = importerName.includes('/')
    ? importerName.slice(0, importerName.lastIndexOf('/') + 1)
    : ''
  const parts = `${dir}${spec}`.split('/')
  const out: string[] = []
  for (const part of parts) {
    if (part === '' || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return out.join('/')
}

// 扫描一个 chunk 的静态/动态相对依赖（返回源码里的原始说明符，未归一）。
// 构建期据此建 DAG；loader 据此递归准备 blob URL。
export const scanPackModuleDeps = (
  code: string,
): { staticDeps: string[]; dynamicDeps: string[] } => {
  const staticDeps: string[] = []
  const dynamicDeps: string[] = []
  for (const match of code.matchAll(PACK_DYNAMIC_IMPORT_RE)) {
    if (match[1]) dynamicDeps.push(match[1])
  }
  for (const match of code.matchAll(PACK_STATIC_IMPORT_RE)) {
    const spec = match[1] ?? match[2]
    if (spec) staticDeps.push(spec)
  }
  return { staticDeps, dynamicDeps }
}

// 重写 chunk 源码：动态 import("./x") → __babaPack.import("<name>")（保持
// 懒加载语义，返回同样的 Promise<namespace>）；静态 "./x" 说明符替换为
// staticUrl 给出的最终地址（loader 侧是依赖已就绪的 blob URL，部署侧是
// 绝对路径）。只动说明符字面量内容，不动引号。
export const rewritePackModule = (
  code: string,
  importerName: string,
  staticUrl: (depName: string) => string,
): string => {
  const dynamicRewritten = code.replace(
    PACK_DYNAMIC_IMPORT_RE,
    (_match, spec: string) =>
      `__babaPack.import(${JSON.stringify(resolvePackDep(importerName, spec))})`,
  )
  return dynamicRewritten.replace(
    PACK_STATIC_IMPORT_RE,
    (match, fromSpec?: string, sideSpec?: string) => {
      const spec = fromSpec ?? sideSpec
      if (!spec) return match
      return match.replace(
        `./${spec}`,
        staticUrl(resolvePackDep(importerName, spec)),
      )
    },
  )
}
