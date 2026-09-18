# Baba Is You

日本語 | [English](./README.md) | [中文](./README.zh-CN.md)

純粋なロジックコアを持つ Baba Is You 実装です。フロントエンドは単一 HTML Web（`src/web/app.ts`）です。

## クイックスタート

```bash
pnpm install
pnpm build
pnpm verify-levels:official   # ローカルの data/baba ダンプが必要（gitignore 済み）
pnpm test
pnpm lint
pnpm type-check
```

## 主要コマンド

| コマンド | 説明 |
|---------|------|
| `pnpm check` | lint + 型チェック + テストを一括実行 |
| `pnpm simulate` | ヘッドレスでレベルをステップ実行（例 `pnpm simulate 0 rrdl --trace`） |
| `pnpm build` | 単一 HTML 生成（`release/baba-is-you.html`） |
| `pnpm watch` | 変更を監視して単一ファイルを再ビルド |
| `pnpm verify-levels:official` | ローカルの `data/baba/*.(l|ld)` ダンプ（gitignore 済み・非配布）と公式レベルテキストの導入整合性を検証 |
| `pnpm import-levels:official` | 公式レベルを `src/levels-data/*.ts` に再導入 |
| `pnpm test` | `src/**/*.test.ts` を実行 |
| `pnpm lint` | UTF-8/LF 正規化 + oxlint で `src/` を lint |
| `pnpm type-check` | 出力なしの型チェック |

## 操作

- メニュー: `W/S` または `↑/↓` で選択、`A/D` または `←/→` でページ移動、`Enter/N/Space` で開始、`Q` で終了
- ゲーム中: `WASD` または矢印で移動、`Space` で待機、`U` で取り消し、`R` でリスタート、勝利後 `N/Enter` で次へ、`Q` でメニューへ戻る
- ゲームパッド（標準レイアウト）: `十字キー`/左スティックで移動・選択、`A` で待機/決定、`B` で取り消し/ダイアログを閉じる、`X` でリスタート、`Start` でメニューへ戻る

## ルールシステム（実装済み）

- 演算子: `X IS Y`、`X HAS Y`、`X MAKE Y`、`X EAT Y`、`X WRITE Y`
- 接続 / 否定: `AND`、`NOT`
- 条件: `ON`、`NEAR`、`FACING`、`LONELY`
- 特殊名詞: `TEXT`、`EMPTY`、`ALL`、`GROUP`、`LEVEL`
- 属性: `you`、`win`、`stop`、`push`、`move`、`open`、`shut`、`defeat`、`sink`、`hot`、`melt`、`weak`、`float`、`tele`、`pull`、`shift`、`swap`、`up`、`right`、`down`、`left`、`red`、`blue`、`best`、`fall`、`more`、`hide`、`sleep`、`group`、`facing`

## レンダリング

- Web: 盤面セルは常に正方形、テキストタイルは全文字表示、ルールと凡例はゲーム内ダイアログで表示
- Web 3D 描画は単一固定のクレイ質感 preset（実行時切替なし）: ピクセル sprite 付きオブジェクトはボクセル押出しのピクセルモデル、それ以外（テキスト/emoji/グリフラベル）は厚み付きプレートとして描画、向き矢印はオーバーレイ層として表示
- Web 3D の立体スタック順は固定: `cursor > you > text > move/fall > push/pull > open/shut > else`（`cursor` はオーバーワールドマップのみ）
- 地貼り要素（`tile`、`water`、`belt`、`line`）は平置きで、上記の立体スタック優先度に参加しません

## 単一 HTML

```bash
pnpm build
```

- 出力先: `release/baba-is-you.html`
- 生成物は自己完結した 1 ファイルで、オフラインで直接開けます

## レベルデータ

- 入口: `src/levels.ts`
- データパック: `src/levels-data/00-official.ts` … `src/levels-data/04-official.ts`（`src/levels.ts` で集約）

## 構成

```text
src/
  levels.ts
  levels-data/
  logic/
  tools/
  view/
  web/
```

## 技術スタック

- Node.js + TypeScript + ESM
- Runtime: `tsx`
- Lint: oxlint (`.oxlintrc.json`)

## 開発メモ

[AGENTS.md](./AGENTS.md) を参照
