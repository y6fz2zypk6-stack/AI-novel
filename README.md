# Novel Studio — LLM で小説を書く個人用 PWA

キャラクター・ロア・世界観ごとの執筆指示・前回までの要約・今回の指示を組み合わせて、
OpenRouter または OpenAI 互換 API で小説の本文を生成するスマホ向け PWA です。

- 仕様：[`docs/novel_pwa_v1_spec.md`](docs/novel_pwa_v1_spec.md)（機能）／[`docs/novel_pwa_v1_design.md`](docs/novel_pwa_v1_design.md)（デザイン）
- サーバーへの置き方：[`docs/DEPLOY.md`](docs/DEPLOY.md)

Next.js 16（App Router）/ TypeScript / Tailwind CSS 4 / SQLite（better-sqlite3 + Drizzle ORM）。
フロントエンドと API を Next.js 1つにまとめています。

## できること（V1）

| 画面 | 内容 |
|---|---|
| Worlds | World（世界観・作品）の一覧・作成・編集。作業中の World を強調表示 |
| Write | タイトル・モデル・登場人物/ロアの選択（チップ）・前回までの要約・今回の指示。入力は自動で下書き保存。Context Preview（セクション別の推定トークン数と全文） |
| 候補確認 | 生成中の本文を逐次表示。候補を左右に切り替え（スワイプ可）・再生成・修正指示付き再生成・停止・採用。候補ごとの Prompt Snapshot |
| 採用後 | 次話用の要約（自動生成 → 編集 → 保存）、スチル画像の生成、次のエピソードへ |
| Library | 人物・ロア・話・スチルの管理 |
| Settings | Provider（OpenRouter / OpenAI 互換）、用途別の既定モデル（執筆・要約・画像）、Temperature・Max Tokens |

## 仕様からの判断・補足

- **生成はサーバー側で走らせ、画面は0.8秒ごとに差分を取りに行く**（ストリーミング表示の代わり）。
  スマホの画面が消えて通信が切れても生成は続き、戻ってくると続きから表示されます。
  生成途中の本文は3秒ごとに DB にも保存されます。停止ボタンで途中で止められます。
- **要約は「これまでの要約 + 今回の本文」から作り直す**。V1 は直前の話の要約だけを次へ渡すため、
  前の話までの重要な情報（伏線・持ち物など）が落ちないよう、要約生成時に前回までの要約も渡しています。
  生成した要約は「未保存・AI生成」の下書きとして残り、保存するまで次の話には渡りません。
- **次のエピソードは前の話の人物・ロアの選択を引き継ぐ**（チップで外せます）。モデルの一時変更は引き継がず既定に戻ります。
- **トークン数は推定**（日本語1文字≒1トークン、英語4文字≒1トークン）。生成後は Provider が返した実測値と費用を Snapshot に表示します。
- **API キーは AES-256-GCM で暗号化して SQLite に保存**し、ブラウザには伏せ字だけを返します。`.env` の `OPENROUTER_API_KEY` も使えます。
- **アプリ独自のログインは無し**（Tailscale に任せる）。ただし他サイトからの書き込みリクエストは拒否します（`Sec-Fetch-Site` / `Origin` を確認）。
- **スチル**：要約用モデルが本文から英語の画像 Prompt を作り、画像モデルで縦長（3:4）の画像を作ります。
  OpenRouter は `/images`、OpenAI 互換は `/images/generations` を使います。画像と Prompt は `data/images/` と DB に保存されます。
- **PWA**：manifest・アイコン・最小限の Service Worker（ビルドごとのハッシュ付き静的ファイルだけキャッシュ。キャッシュ名は `novel-v1-…`）。完全オフライン対応はしていません。

## 開発

```bash
npm ci
cp .env.example .env
npm run dev                  # http://localhost:3100
```

API キー無しで試すときは、付属のモック LLM を使います。

```bash
node scripts/mock-llm.mjs    # http://127.0.0.1:4010/v1
```

Settings → OpenRouter の Base URL を `http://127.0.0.1:4010/v1`、API キーを適当な文字列にし、
既定モデルを `mock/writer`（画像は `mock/image`）にすると、生成・要約・スチルまで一通り動きます。

### チェック

```bash
npm run typecheck
npm run lint
npm test                     # プロンプト組み立て・API 呼び出し・生成〜採用〜要約〜スチルの流れ（モック LLM）
npm run build && npm run e2e # ブラウザ（390px 幅）で全画面を操作し、test-results/ にスクリーンショットを保存
```

`npm run e2e` には Chromium が必要です（`CHROMIUM_PATH` で場所を指定。無ければ `npx playwright-core install chromium`）。

### DB の構造を変えるとき

`src/lib/db/schema.ts` を編集して `npm run db:generate` を実行すると、`drizzle/` にマイグレーションが追加されます。
アプリは起動時に未適用のマイグレーションを自動で適用します。

## 構成

```
src/
  app/                    画面（App Router）と API（app/api/**/route.ts）
    page.tsx              Worlds
    w/[worldId]/write     Write（生成前）
    w/[worldId]/episodes/[episodeId]   候補確認 / 採用後
    w/[worldId]/library   Library
    settings              Settings
    manifest.ts, sw.js/   PWA
  components/             画面部品（Sheet・Chip・Dock・TabBar など）と各画面
  lib/
    prompt.ts             プロンプトの組み立て（Context Preview とサーバーで共通）
    tokens.ts             トークン数の推定
    db/schema.ts          DB スキーマ（Drizzle）
    server/
      llm/client.ts       OpenRouter / OpenAI 互換の呼び出し（SSE・画像・モデル一覧）
      llm/errors.ts       エラーの分類（キー無効・レート制限・コンテキスト長超過など）
      generation.ts       本文生成ジョブ・ポーリング・停止
      summary.ts          要約生成ジョブ
      stills.ts           スチル生成ジョブ
      repo/               テーブルごとの読み書き
drizzle/                  マイグレーション SQL
scripts/mock-llm.mjs      テスト用のモック LLM
test/                     ユニットテスト・E2E
```

データは `DATA_DIR`（既定 `./data`）に保存されます：`app.sqlite`・`images/`・`secret.key`。
