# Baba Is You

日本語 | [English](./README.md) | [中文](./README.zh-CN.md)

純粋なロジックコアを持つ Baba Is You 実装です。フロントエンドは単一 HTML Web（`src/web/app.ts`）です。

**オンラインでプレイ: https://auvya.com/baba**

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
| `pnpm build` | ローカル単一 HTML を生成（`release-local/baba-is-you.html`） |
| `pnpm build:deploy` | デプロイ用シェル + ゲート付き bundle を生成（`release/`） |
| `pnpm deploy` | デプロイ版をビルドして `auvya.com/baba` へ公開（`docs/deploy.md` 参照） |
| `pnpm watch` | 変更を監視して単一ファイルを再ビルド |
| `pnpm verify-levels:official` | ローカルの `data/baba/*.(l|ld)` ダンプ（gitignore 済み・非配布）と公式レベルテキストの導入整合性を検証 |
| `pnpm import-levels:official` | 公式レベルを `src/levels-data/*.ts` に再導入 |
| `pnpm test` | `src/**/*.test.ts` を実行 |
| `pnpm lint` | UTF-8/LF 正規化 + oxlint で `src/` を lint |
| `pnpm type-check` | 出力なしの型チェック |

## 操作

- 起動するとフラットなレベルメニューが開く：全公式レベルの番号付きグリッドと、ハイライト中レベルのプレビュー canvas。`WASD`/矢印で選択移動（`左右`はセル単位、`上下`は行単位）、`PgUp`/`PgDn` でページ移動、`Enter`/`Space`/`N` またはクリック/タップで進入。セルにホバーすると選択が追従しプレビューを描画
- ゲーム中: `WASD` または矢印で移動、`Space` で待機、`U/Z` で取り消し、`R` でリスタート、勝利後 `N/Enter` で次のレベルへ、`Q` でメニューへ戻る
- HUD ボタンはキーボード動詞と同等（取り消し/待機/リスタート/メニュー）。表示中レベルに録画済み golden がある場合 **Solution** ボタンで再生。再生中は `Q`（中断してメニューへ）以外の入力を無視
- タッチ: スワイプで移動、タップで待機、その他は HUD ボタン。縦持ちスマホは横画面に強制回転
- ゲームパッド（標準レイアウト）: `十字キー`/左スティックで移動・メニュー操作、`A` で待機/進入、`B` で取り消し/戻る/ダイアログを閉じる、`X` でリスタート、`Start` で戻る、`Select` で操作・ルールダイアログ。`A`/`B` 長押しで待機/取り消し連打。勝敗時は対応ハードウェアで振動

## ルールシステム（実装済み）

- 演算子: `X IS Y`、`X HAS Y`、`X MAKE Y`、`X EAT Y`、`X WRITE Y`、`X FEAR Y`、`X FOLLOW Y`、`X MIMIC Y`、`X PLAY Y`、`X BECOME Y`
- 接続 / 否定: `AND`、`NOT`（主語・目的語・条件の対象に適用可能）
- 中置条件: `ON`、`NEAR`、`FACING`、`NEXTTO`、`FACEDBY`、`SEEING`、`WITHOUT`、`ABOVE`、`BELOW`、`BESIDELEFT`、`BESIDERIGHT`、`FEELING`
- 前置条件: `LONELY`、`IDLE`、`OFTEN`、`SELDOM`、`POWERED`、`POWERED2`、`POWERED3`
- 特殊名詞: `TEXT`、`EMPTY`、`ALL`、`GROUP`、`GROUP2`、`GROUP3`、`LEVEL`
- 文字ユニット（`a`–`z`、`0`–`9`、`sharp`、`flat`、`ab`、`ba`）は単体では単語にならない——隣接 2 セル以上の連続した文字列が辞書の単語を綴るとルールに参加。`PLAY` テキストを含むレベルでは音符辞書に切り替わる
- 属性: 公式 type-2 語彙の全量は `src/logic/types.ts` の `CORE_PROPERTIES` を参照——`you`/`you2`/`3d`、`win`/`end`/`done`、`stop`、`push`、`pull`、`move`、`auto`、`chill`、`open`、`shut`、`defeat`、`sink`、`hot`、`melt`、`weak`、`float`、`tele`、`shift`、`swap`、`facing`、`up`/`right`/`down`/`left`、`fall`/`fallup`/`fallleft`/`fallright`、`back`、`reverse`、`revert`、`more`、`hide`、`sleep`、`still`、`broken`、`safe`、`word`、`phantom`、`hold`、`select`、`boom`、`turn`、`deturn`、`nudge*`、`locked*`、`power`/`power2`/`power3`、`bonus`、`best`、`group`/`group2`/`group3`、および効果を持たない感情/色/メタ語（`wonder`、`sad`、`happy`、`angry`、`party`、`pet`、`red`、`blue` など。インポートした公式ルール文が名詞へ退化しないよう属性としてパースされる）

## レンダリング

- Web: 盤面セルは常に正方形、テキストタイルは全文字表示、操作と有効ルールはゲーム内ダイアログで表示
- Web 3D 描画は単一固定のクレイ質感 preset（実行時切替なし）: ピクセル sprite 付きオブジェクトはボクセル押出しのピクセルモデル、それ以外（テキスト/emoji/グリフラベル）は厚み付きプレートとして描画、向き矢印は隆起したオーバーレイ層として表示
- Web 3D の立体スタック順は固定: `cursor > you > text > move/fall > push/pull > open/shut > else`
- 地貼り要素（`tile`、`water`、`lava`、`belt`、`line`、およびインポートされた `tile_*` 床タイル）は平置きで、上記の立体スタック優先度に参加しない
- `level is you`/`move`/`fall*`/`push`/`pull` は部屋全体をスクロール/回転——純粋な描画オフセットで、論理位置は動かない
- 描画はオンデマンド駆動: 常駐アニメーションだけで RAF を維持しない

## 単一 HTML

```bash
pnpm build
```

- 出力先: `release-local/baba-is-you.html`
- 生成物は自己完結した 1 ファイルで、オフラインで直接開けます
- `pnpm build:deploy` は `release/baba-is-you.html`（シェルローダー）+ `release/baba-is-you.js`（`auvya.com` でのみ動作するゲート付き bundle）を出力——[docs/deploy.md](./docs/deploy.md) 参照

## レベルデータ

- 入口: `src/levels.ts` — 12 個のデータパック（`src/levels-data/00-official.ts` … `11-official.ts`、約 566 レベル）を集約。`pnpm import-levels:official` で生成
- 公式 `leveltype=1` オーバーワールドマップはインポート検証のみに使用——アプリはフラットメニューで選び、プレイ可能なマップデータは生成しない
- `levels/**/*.txt`: `src/logic/parse-level.ts` がパースするエンティティ列挙形式のフィクスチャ（golden リプレイが読み込む。1 セル複数エンティティ対応）
- `goldens/**/*.json`: クリア済みプレイスルーの記録。`src/logic/goldens.test.ts` が全量リプレイで検証し、アプリ内では対応レベルにバインドされ Solution ボタンを駆動

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
- Web: Three.js + postprocessing + n8ao
- Lint: oxlint (`.oxlintrc.json`)

## 開発メモ

[AGENTS.md](./AGENTS.md) と [ドキュメント索引](./docs/README.md) を参照
- ロジックアーキテクチャ: [docs/logic-architecture.md](./docs/logic-architecture.md)
- Web アプリアーキテクチャ: [docs/web-architecture.md](./docs/web-architecture.md)
- 3D レンダラー: [docs/rendering-3d.md](./docs/rendering-3d.md)
- レベルデータと goldens: [docs/level-data.md](./docs/level-data.md)
