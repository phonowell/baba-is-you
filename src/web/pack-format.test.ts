import { gzipSync } from 'node:zlib'

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  applyPackKeystream,
  createKeystream,
  fnv1a,
  PACK_DYNAMIC_IMPORT_RE,
  PACK_STATIC_IMPORT_RE,
  resolvePackDep,
  rewritePackModule,
  scanPackModuleDeps,
} from './pack-format.js'

describe('fnv1a', () => {
  it('pins the hash values the deploy seed mask relies on', () => {
    assert.equal(fnv1a(''), 2166136261)
    assert.equal(fnv1a('a'), 3826002220)
    assert.equal(fnv1a('baba-pack-v1|auvya.com'), 3819469820)
  })
})

describe('applyPackKeystream', () => {
  it('is a symmetric xor mask: applying twice restores the input', () => {
    const source = new Uint8Array([0, 1, 127, 128, 255, 42])
    const masked = applyPackKeystream(source, 0x9e3779b9)
    assert.notDeepEqual([...masked], [...source])
    assert.deepEqual([...applyPackKeystream(masked, 0x9e3779b9)], [...source])
  })

  it('produces different streams for different seeds', () => {
    const source = new Uint8Array([1, 2, 3, 4])
    assert.notDeepEqual(
      [...applyPackKeystream(source, 1)],
      [...applyPackKeystream(source, 2)],
    )
  })

  it('restarts the stream per call so each payload decodes independently', () => {
    const source = new Uint8Array([9, 9, 9])
    assert.deepEqual(
      [...applyPackKeystream(source, 7)],
      [...applyPackKeystream(source, 7)],
    )
    const reused = createKeystream(7)
    const next = reused()
    assert.equal(typeof next, 'number')
  })
})

describe('pack decode roundtrip', () => {
  it('gzip → xor → base64 → atob → xor → DecompressionStream restores text', async () => {
    const text = 'const answer = 42;\n'.repeat(64)
    const seed = 0x51ed270b
    const packed = Buffer.from(
      applyPackKeystream(gzipSync(text, { level: 9 }), seed),
    ).toString('base64')

    // 与产物内联 loader 同一条解码路径。
    const bin = Uint8Array.from(atob(packed), (char) => char.charCodeAt(0))
    const unmasked = applyPackKeystream(bin, seed)
    const decoded = await new Response(
      new Blob([unmasked.buffer as ArrayBuffer])
        .stream()
        .pipeThrough(new DecompressionStream('gzip')),
    ).text()
    assert.equal(decoded, text)
  })
})

describe('resolvePackDep', () => {
  it('resolves sibling specifiers from a root-level entry', () => {
    assert.equal(resolvePackDep('app.js', './chunks/x-1.js'), 'chunks/x-1.js')
  })

  it('resolves inside a subdirectory', () => {
    assert.equal(
      resolvePackDep('chunks/a-1.js', './b-2.js'),
      'chunks/b-2.js',
    )
    assert.equal(
      resolvePackDep('chunks/a-1.js', './sub/c.js'),
      'chunks/sub/c.js',
    )
  })

  it('walks up with ..', () => {
    assert.equal(resolvePackDep('chunks/a-1.js', '../shared.js'), 'shared.js')
  })
})

describe('scanPackModuleDeps', () => {
  const code = [
    'import{a as b}from"./chunks/shared-1.js";',
    'import"./chunks/side-2.js";',
    'export{c}from"./chunks/re-3.js";',
    'const load=()=>import("./lazy-4.js");',
    'const spaced = import( "./lazy-5.js" );',
  ].join('')

  it('separates static and dynamic deps without overlap', () => {
    const { staticDeps, dynamicDeps } = scanPackModuleDeps(code)
    assert.deepEqual(staticDeps.sort(), [
      'chunks/re-3.js',
      'chunks/shared-1.js',
      'chunks/side-2.js',
    ])
    assert.deepEqual(dynamicDeps.sort(), ['lazy-4.js', 'lazy-5.js'])
  })

  it('does not match import() as a static import', () => {
    assert.equal(PACK_STATIC_IMPORT_RE.lastIndex, 0)
    const { staticDeps } = scanPackModuleDeps('x = import("./only-dyn.js")')
    assert.deepEqual(staticDeps, [])
    const { dynamicDeps } = scanPackModuleDeps('x = import("./only-dyn.js")')
    assert.deepEqual(dynamicDeps, ['only-dyn.js'])
  })
})

describe('rewritePackModule', () => {
  it('rewrites static specifiers to resolved urls and dynamic ones to the loader', () => {
    const code =
      'import{a}from"./chunks/s-1.js";const go=()=>import("./lazy-9.js");'
    const urls = new Map([['chunks/s-1.js', 'blob:https://x/1']])
    const out = rewritePackModule(code, 'app.js', (name) => {
      const url = urls.get(name)
      if (!url) throw new Error(`unexpected dep ${name}`)
      return url
    })
    assert.equal(
      out,
      'import{a}from"blob:https://x/1";' +
        'const go=()=>__babaPack.import("lazy-9.js");',
    )
  })

  it('normalizes dep names relative to the importing chunk', () => {
    const seen: string[] = []
    rewritePackModule('export{x}from"./y-1.js"', 'chunks/a-1.js', (name) => {
      seen.push(name)
      return `/${name}`
    })
    assert.deepEqual(seen, ['chunks/y-1.js'])
  })

  it('leaves non-module "./" strings inside code untouched', () => {
    const code = 'const label = "./not-a-module";'
    const out = rewritePackModule(code, 'app.js', () => {
      throw new Error('must not resolve')
    })
    assert.equal(out, code)
  })
})

// 注入到产物的 loader 只认这两个正则；断言它们保持全局标志，防止替换时
// 只命中第一处。
describe('pack regexes', () => {
  it('stay global for matchAll/replace', () => {
    assert.ok(PACK_DYNAMIC_IMPORT_RE.global)
    assert.ok(PACK_STATIC_IMPORT_RE.global)
  })
})
