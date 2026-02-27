# Baba Is You CLI

日本語 | [English](./README.md) | [中文](./README.zh-CN.md)

ターミナル中心の Baba Is You 実装です。純粋なロジックコアを共有し、CLI（`src/cli.ts`）と単一 HTML Web（`src/web/app.ts`）を提供します。

## クイックスタート

```bash
pnpm install
pnpm start
pnpm build
pnpm verify-levels:official
pnpm test
pnpm lint
pnpm type-check
```

## 主要コマンド

| コマンド | 説明 |
|---------|------|
| `pnpm start` | CLI ゲーム起動（`src/cli.ts`） |
| `pnpm build` | 単一 HTML 生成（`release/baba-is-you.html`） |
| `pnpm verify-levels:official` | `data/baba/*.(l|ld)` の公式レベルテキスト導入整合性を検証 |
| `pnpm import-levels:official` | 公式レベルを `src/levels-data/*.ts` に再導入 |
| `pnpm test` | `src/**/*.test.ts` を実行 |
| `pnpm lint` | `src/**/*.ts` を lint + 自動修正 |
| `pnpm type-check` | 出力なしの型チェック |

## 操作

- メニュー: `W/S` または `↑/↓` で選択、`A/D` または `←/→` でページ移動、`Enter/N/Space` で開始、`Q` で終了（CLI）
- ゲーム中: `WASD` または矢印で移動、`Space` で待機、`U` で取り消し、`R` でリスタート、勝利後 `N/Enter` で次へ、`Q` でメニューへ戻る
- CLI プロセス終了: `Ctrl+C`

## ルールシステム（実装済み）

- 演算子: `X IS Y`、`X HAS Y`、`X MAKE Y`、`X EAT Y`、`X WRITE Y`
- 接続 / 否定: `AND`、`NOT`
- 条件: `ON`、`NEAR`、`FACING`、`LONELY`
- 特殊名詞: `TEXT`、`EMPTY`、`ALL`、`GROUP`、`LEVEL`
- 属性: `you`、`win`、`stop`、`push`、`move`、`open`、`shut`、`defeat`、`sink`、`hot`、`melt`、`weak`、`float`、`tele`、`pull`、`shift`、`swap`、`up`、`right`、`down`、`left`、`red`、`blue`、`best`、`fall`、`more`、`hide`、`sleep`、`group`、`facing`

## レンダリング

- ターミナル: 固定 2 桁幅セル、テキストタイルは 2 文字コード、`IS` は専用色、ルールと凡例を常時表示
- Web: 盤面セルは常に正方形、テキストタイルは全文字表示、ルールと凡例はゲーム内ダイアログで表示
- Web 3D 描画は単一固定 HD2D preset を使用し、実行時切替はありません
- Web 3D の立体スタック順は固定: `you > text > move/fall > push/pull > open/shut > else`
- 地貼り要素（`tile`、`water`、`belt`）は上記の立体スタック優先度に参加しません

## 単一 HTML

```bash
pnpm build
```

- 出力先: `release/baba-is-you.html`
- 生成物は自己完結した 1 ファイルで、オフラインで直接開けます

## レベルデータ

- 入口: `src/levels.ts`
- データパック: `src/levels-data/00-official.ts`、`src/levels-data/01-official.ts`、`src/levels-data/02-official.ts`

## 構成

```text
src/
  cli.ts
  levels.ts
  levels-data/
  logic/
  view/
  web/
```

## 技術スタック

- Node.js + TypeScript + ESM
- Runtime: `tsx`
- Lint: ESLint (`eslint.config.mjs`)

## 開発メモ

[CLAUDE.md](./CLAUDE.md) を参照
