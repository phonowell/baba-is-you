// Build-injected runtime surface — both sides live in
// scripts/build-single-html.ts:
//
// - `baba-golden-index` virtual module: the golden→campaign binding resolved
//   at build time (bindGoldensToLevels over the manifest), so the app boots
//   with the hasSolution map and never touches the recordings eagerly.
// - `__babaPack`: the inline pack loader. Every payload ships gzip+XOR packed
//   (embedded base64 locally, fetched from /baba/payloads/ on deploy); these
//   calls decode on demand. `import` backs the rewritten `import("./x")`
//   specifiers inside chunks; `text` serves data payloads like goldens.json.
//
// Under tsx tests neither exists — modules that need them take the pieces
// as parameters (createGoldenStore receives a reader + the index).

declare module 'baba-golden-index' {
  const index: Record<string, string>
  export default index
}

declare const __babaPack: {
  import: (name: string) => Promise<unknown>
  text: (name: string) => Promise<string>
}
