# Baba Is You CLI

日本語 | [English](./README.md) | [中文](./README.zh-CN.md)

純粋なロジックとステートレスな描画で作られたターミナル版 Baba Is You。

## クイックスタート

```bash
pnpm install
pnpm start
pnpm lint
pnpm type-check
```

## 主要コマンド

| コマンド | 説明 |
|---------|------|
| `pnpm start` | ゲーム起動（`src/cli.ts`） |
| `pnpm lint` | `src/**/*.ts` を lint + 自動修正 |
| `pnpm type-check` | 出力なしの型チェック |

## 操作

- 移動：WASD または 矢印キー
- 取り消し：U
- リスタート：R
- 次のステージ / クリア後リスタート：N または Enter
- 終了：Q または Ctrl+C

## ルール（コア）

- 対応：`X IS Y`
- 属性：you, win, stop, push, defeat, sink, hot, melt
- 非対応：has, and, not, on, make

## レンダリング

- 固定 2 列幅セル
- テキストは 2 文字コード；IS は別色
- 盤面下にルールと凡例を表示
- ANSI カラー対応

## レベル元データ

- `src/levels.ts` は `../kikyo/source/static/script/include/data.coffee` から生成

## 構成

```
src/
  cli.ts
  levels.ts
  logic/
  view/
```

## 技術スタック

- Node.js + TypeScript + ESM
- Runtime: tsx
- Lint: ESLint (`eslint.config.mjs`)

## 開発メモ

[CLAUDE.md](./CLAUDE.md) を参照
