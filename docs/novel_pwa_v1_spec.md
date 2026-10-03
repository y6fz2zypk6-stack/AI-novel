# 小説生成PWA V1 仕様書

## 1. 概要

本システムは、個人利用を前提としたスマートフォン対応の小説生成PWAである。

キャラクター設定、ロア、世界観ごとの執筆指示、前回までの要約、今回のエピソード指示を組み合わせ、OpenRouterまたはOpenAI互換API経由でLLMを呼び出して小説本文を生成する。

生成結果は複数候補を保持し、ユーザーが採用した本文のみを正式なエピソードとして扱う。

採用後は次話用の要約生成およびスチル画像生成を行える。

V1では機能を最小限に抑え、複雑なプロット管理、RAG、Vector DB、エージェント処理などは実装しない。

---

## 2. 基本方針

### 2.1 想定利用者

単一ユーザーによる個人利用。

マルチユーザー対応は行わない。

アプリケーション独自のログイン機能は持たず、Tailscaleによってアクセスを制限する。

### 2.2 想定環境

- スマートフォン
- PCブラウザ
- PWAとしてホーム画面から起動可能
- さくらVPS上で稼働
- Tailscale経由でのみアクセス
- HTTPS対応

### 2.3 技術スタック

推奨構成：

- Next.js
- TypeScript
- Tailwind CSS
- SQLite
- Drizzle ORM または Prisma
- OpenRouter API
- OpenAI互換API
- PWA Manifest / Service Worker
- Docker Compose
- Caddy
- Tailscale

V1ではNext.js内にフロントエンドとAPIを統合する。

別バックエンドサービスは作成しない。

---

## 3. システム構成

```text
スマートフォン / PC
        │
        │ Tailscale
        ▼
    さくらVPS
        │
      Caddy
        │
        ▼
    Next.js PWA
      │      │
      │      └──── SQLite
      │
      └────────── OpenRouter / OpenAI互換API
                      │
                      ├─ Text LLM
                      └─ Image Model
```

APIキーはブラウザへ送信しない。

すべてのAI API呼び出しはNext.jsサーバー側から行う。

---

## 4. 主要概念

### 4.1 World

「世界観」「シリーズ」「作品世界」を表す最上位単位。

V1ではWorldと作品を同一概念として扱う。

例：

```text
World A
現代学園ミステリー

World B
異世界ファンタジー

World C
SF宇宙もの
```

Worldごとに以下を保持する。

- 名前
- 説明
- 基礎執筆指示
- キャラクター
- ロア
- エピソード

---

## 5. World基礎執筆指示

各Worldは、その世界専用の執筆指示を持つ。

例：

```text
三人称一元視点。

心理描写を重視する。

説明しすぎず、可能な限り行動や会話から情報を伝える。

会話文は自然な現代日本語にする。

地の文は落ち着いた文体にする。

一文を極端に短くしすぎない。

キャラクターの内面を説明だけで済ませず、
仕草・視線・行動によって表現する。
```

この指示は、World内で生成されるすべての本文に基本コンテキストとして付与する。

各Episode固有の指示は、このWorld基礎指示へ追加する。

---

## 6. Characters

Worldごとに複数のCharacterを登録できる。

V1ではCharacter情報を細かく構造化しない。

Markdownまたはプレーンテキストとして自由記述する。

例：

```text
名前：佐倉ミナ

19歳。大学一年生。

人付き合いが苦手だが観察力が高い。

普段は冷静だが、弟のことになると感情的になる。

外見：
黒髪のショートヘア。
身長160cm。

話し方：
短めの文章。
敬語はあまり使わない。

秘密：
10年前の事故について一部記憶を失っている。
```

生成時には必要なCharacterをユーザーが手動選択する。

V1では自動選択を行わない。

---

## 7. Lore

Worldごとに複数のLoreを登録できる。

LoreもCharacterと同様、自由記述テキストとして保存する。

例：

```text
タイトル：
白ヶ丘高校

内容：
創立80年の私立高校。

旧校舎は10年前から閉鎖されている。

生徒の間では旧校舎の三階で
夜に少女の姿を見たという噂がある。
```

生成時には必要なLoreをユーザーが手動選択する。

V1ではVector Searchや自動Lore検索を実装しない。

---

## 8. Episode

World内に複数のEpisodeを作成できる。

Episodeは、小説の1話または1シーン相当の単位とする。

保持する情報：

- タイトル
- エピソード番号
- 今回の指示
- 前回までの要約
- 生成候補
- 採用された本文
- 次話用要約
- 生成された画像

---

## 9. 本文生成フロー

基本フロー：

```text
World選択
↓
Episode作成
↓
Character選択
↓
Lore選択
↓
前回要約確認
↓
今回の指示入力
↓
モデル選択
↓
Context Preview
↓
本文生成
↓
候補確認
├─ 再生成
├─ 修正指示付き再生成
└─ 採用
      ↓
   要約生成
      ↓
   要約確認・手動編集
      ↓
   保存
```

---

## 10. LLMへ渡すコンテキスト

本文生成時は以下の順番でプロンプトを構築する。

```text
1. System Instruction

2. World Base Instruction

3. Characters

4. Lore

5. Previous Story Summary

6. Current Episode Instruction

7. Output Instruction
```

概念例：

```text
[SYSTEM]

あなたは日本語小説を書くAIです。

---

[WORLD INSTRUCTION]

三人称一元視点。
心理描写を重視する。
...

---

[CHARACTERS]

## 佐倉ミナ
...

## 朝倉レン
...

---

[LORE]

## 白ヶ丘高校
...

---

[PREVIOUS STORY]

前回までに以下の出来事が発生した。
...

---

[CURRENT INSTRUCTION]

今回は放課後の屋上でミナとレンが会話する。

最初は険悪だが、
最後には少しだけ互いへの警戒が薄れる。

---

[OUTPUT]

上記設定を守って日本語小説本文を書いてください。
```

---

## 11. Previous Summary

原則として前Episodeの採用済み要約を次のEpisodeへ渡す。

ユーザーは生成前に内容を確認・編集できる。

V1では基本的に直前EpisodeのSummaryを利用する。

将来的には以下へ拡張可能。

```text
Long-term Story Memory
+
Previous Episode Summary
```

---

## 12. 再生成

同一Episodeについて複数の生成候補を保持する。

再生成しても以前の結果を削除しない。

UI例：

```text
Generation 2 / 4

[←]            [→]

本文……

[再生成]

[修正指示付き再生成]

[この本文を採用]
```

採用されたGenerationのみをEpisodeの正式本文として扱う。

---

## 13. 修正指示付き再生成

ユーザーは現在の本文に対して追加の指示を入力できる。

例：

```text
会話を増やしてください。

主人公をもう少し冷淡にしてください。

展開はそのままで情景描写を増やしてください。
```

V1では全文を再生成する。

部分編集・diff編集は実装しない。

---

## 14. 採用

Generationに「採用」操作を行う。

採用したGeneration IDをEpisodeへ保存する。

必要に応じて後から別Generationへ採用を変更できる設計とする。

---

## 15. 要約生成

本文採用後、「要約生成」を実行できる。

要約は次話のLLMへ渡すための継続用メモリとして使用する。

要約プロンプト例：

```text
以下の小説本文を、
次のエピソードを書くAIが必要とする情報だけに整理してください。

必ず以下を含めてください。

- 起きた出来事
- キャラクター間の関係変化
- 新しく判明した情報
- 現在の場所・状況
- 未回収の伏線
- 持ち物
- 負傷
- 約束
- キャラクターの認識変化
- その他、次話の整合性に必要な事項

文学的な文章ではなく、
AIが次話を書くための実用的な情報としてまとめてください。
```

---

## 16. 要約編集

生成された要約は必ずユーザーが編集可能にする。

```text
[要約生成]

↓

生成された要約

[編集]

↓

[保存]
```

AIが重要情報を落とす可能性があるため、自動生成した要約を確定扱いしない。

---

## 17. Prompt / Context Preview

本文生成前または生成履歴から、実際にAIへ渡したコンテキストを確認できる。

表示例：

```text
Context Preview

System                 420 tokens
World Instruction      580 tokens
Characters            1,420 tokens
Lore                    860 tokens
Previous Summary        630 tokens
Episode Instruction     180 tokens

Total                  4,090 tokens
```

可能であれば推定Token数を表示する。

Token数計算が複雑なProviderについては文字数表示のみでもよい。

全文表示にも対応する。

目的：

- AIの挙動原因を調べる
- 不要なコンテキストを確認する
- Tokenコストを把握する
- 生成条件を再現する

---

## 18. Prompt Snapshot

各Generationには、生成時点のコンテキストを保存する。

CharacterやLoreを後から編集しても、過去Generationがどの条件で生成されたか確認できるようにする。

保存対象例：

```json
{
  "provider": "openrouter",
  "model": "example-model-id",
  "worldInstruction": "...",
  "characters": [],
  "lore": [],
  "previousSummary": "...",
  "episodeInstruction": "...",
  "generationSettings": {
    "temperature": 0.8
  }
}
```

Generation作成後は、このSnapshotを原則変更しない。

---

## 19. AI Provider

V1では以下に対応する。

### OpenRouter

主な本文・要約・画像生成に使用。

### OpenAI-Compatible

OpenAI互換APIを利用できるProvider。

設定項目：

```text
Provider Name
Base URL
API Key
Default Model
```

例：

```text
OpenRouter
https://openrouter.ai/api/v1

その他OpenAI互換API
https://example.com/v1
```

内部実装ではProviderを直接UIへ密結合させない。

概念的に以下のインターフェースを持つ。

```ts
interface LLMProvider {
  generateText(request: GenerateTextRequest): Promise<GenerateTextResult>
}
```

必要であれば画像生成は別インターフェースにする。

```ts
interface ImageProvider {
  generateImage(request: GenerateImageRequest): Promise<GenerateImageResult>
}
```

---

## 20. Model設定

用途別にデフォルトモデルを設定できる。

例：

```text
Default Writing Model
Default Summary Model
Default Image Model
```

Episode生成時にはデフォルトとは別のモデルへ一時変更可能。

例：

```text
Model
[Claude系モデル ▼]
```

次のEpisodeで自動的にデフォルトへ戻してもよい。

---

## 21. 画像生成

Episodeの採用本文からスチル画像を生成できる。

基本フロー：

```text
採用本文
↓
画像生成指示
↓
必要ならLLMが画像Promptを作成
↓
Image API
↓
画像保存
```

UI例：

```text
スチル生成

場面：
[現在の本文から自動作成]

追加指示：
雨の夜。
映画的な構図。
人物を画面中央に置かない。

Model:
[画像モデル ▼]

[生成]
```

画像Promptは保存する。

生成された画像はEpisodeに紐付ける。

---

## 22. 画像保存

V1ではVPSローカルストレージを使用する。

例：

```text
/data/images/
```

DBには以下を保存する。

- ファイルパス
- 使用モデル
- Prompt
- Episode ID
- Generation ID
- 作成日時

---

## 23. 画面構成

V1では以下の4画面を基本とする。

```text
Worlds
Write
Library
Settings
```

---

## 24. Worlds画面

登録済みWorld一覧を表示する。

例：

```text
Worlds

学園ミステリー

異世界ファンタジー

SF

[＋ 新しいWorld]
```

Worldを選択すると、そのWorldを現在の作業対象にする。

World編集画面：

```text
World Name

Description

Base Writing Instruction

[保存]
```

---

## 25. Write画面

メイン画面。

スマートフォンで最も使いやすいことを優先する。

構成例：

```text
Episode 12

Title
[雨の屋上]

Model
[モデル名 ▼]

Characters

☑ ミナ
☑ レン
☐ 教師

Lore

☑ 白ヶ丘高校
☑ 10年前の事故
☐ 魔法設定

Previous Summary

[表示 / 編集]

Current Instruction

┌─────────────────┐
│                   │
│                   │
└─────────────────┘

[Context Preview]

[Generate]
```

生成後：

```text
Generation 2 / 4

本文……

[←] [→]

[再生成]

[修正指示]

[採用]
```

採用後：

```text
[要約生成]

[スチル生成]
```

---

## 26. Library画面

World内の各データを管理する。

タブ：

```text
Characters
Lore
Episodes
Stills
```

Character編集：

```text
Name

Content
┌─────────────────┐
│ Markdown / text   │
└─────────────────┘

[保存]
```

Loreも同様。

---

## 27. Settings画面

以下を設定する。

### Provider

```text
OpenRouter

OpenAI-Compatible
```

### Provider設定

```text
Base URL
API Key
Default Model
```

API Keyは画面に再表示する場合でも全文を露出しない。

### Model

```text
Writing Model
Summary Model
Image Model
```

### Generation Settings

V1で対応する場合：

```text
Temperature
Max Tokens
```

その他Provider固有パラメータはV1では最小限とする。

---

## 28. DBスキーマ案

### worlds

```text
id
name
description
base_instruction
created_at
updated_at
```

### characters

```text
id
world_id
name
content
created_at
updated_at
```

### lore

```text
id
world_id
title
content
created_at
updated_at
```

### episodes

```text
id
world_id
episode_number
title
instruction
previous_summary
accepted_generation_id
summary
created_at
updated_at
```

### episode_characters

```text
episode_id
character_id
```

### episode_lore

```text
episode_id
lore_id
```

### generations

```text
id
episode_id
provider
model
content
prompt_snapshot
generation_settings
created_at
```

### images

```text
id
episode_id
generation_id
provider
model
prompt
file_path
created_at
```

### provider_settings

```text
id
name
provider_type
base_url
encrypted_api_key
default_text_model
default_summary_model
default_image_model
created_at
updated_at
```

---

## 29. API Route案

例：

```text
/api/worlds

/api/worlds/:id

/api/characters

/api/lore

/api/episodes

/api/episodes/:id/generate

/api/episodes/:id/generations

/api/episodes/:id/accept

/api/episodes/:id/summarize

/api/episodes/:id/images

/api/providers

/api/models
```

API構成は実装時にNext.jsのRoute Handler構成に合わせて変更可能。

---

## 30. APIキー管理

APIキーをブラウザへ返さない。

APIキーはサーバー側のみで利用する。

可能であれば暗号化してDB保存する。

より簡単なV1とする場合、OpenRouterなど主要ProviderのKeyは環境変数でもよい。

例：

```env
OPENROUTER_API_KEY=
```

OpenAI-Compatible ProviderをUIから自由登録する場合は、DB保存方式を利用する。

---

## 31. Tailscale

アクセス制御はTailscaleへ任せる。

アプリ独自の以下の機能は実装しない。

- ユーザー登録
- パスワード認証
- OAuth
- セッション管理
- パスワードリセット

VPSは原則Tailnet経由のみアクセス可能とする。

必要であればTailscale ServeまたはCaddyとの組み合わせを利用する。

---

## 32. PWA

最低限以下へ対応する。

- Web App Manifest
- ホーム画面追加
- standalone表示
- アイコン
- theme-color
- viewport最適化
- スマートフォンUI

完全オフライン対応はV1では不要。

AI生成にはネットワーク接続が必要。

---

## 33. レスポンシブ設計

スマートフォンを優先する。

主要操作は片手でも行いやすいUIにする。

特に以下を避ける。

- 横スクロール前提
- 大きなテーブル
- 常時表示される複雑なサイドバー
- 小さすぎるボタン

PCでは画面幅を広げて表示してよい。

---

## 34. Generation UX

生成中は状態を明確に表示する。

例：

```text
Generating...
```

可能であればStreaming表示へ対応する。

ただしV1完成を優先し、Streaming対応によって実装が複雑になる場合は後回しでもよい。

生成失敗時は既存本文を失わない。

---

## 35. エラー処理

最低限以下を扱う。

- API Key無効
- Provider接続失敗
- Model不存在
- Rate Limit
- API Timeout
- Context Length超過
- Image Generation失敗
- DB保存失敗

エラー時に既存のGenerationや入力内容を削除しない。

---

## 36. データ保全

SQLite DBと画像ディレクトリをバックアップ対象とする。

例：

```text
/data/app.sqlite
/data/images/
```

V1では高度なバックアップシステムを実装しなくてもよい。

Docker Volumeまたはホストディレクトリへ永続化する。

---

## 37. Docker構成

想定：

```text
docker-compose.yml

services:
  app
  caddy
```

SQLiteと画像はVolumeまたはホスト側へ保存する。

例：

```text
/data
```

コンテナ再作成でデータが消えないこと。

---

## 38. V1で実装しないもの

以下は明示的にV1対象外とする。

- RAG
- Vector Database
- Embedding
- 自動Lore検索
- AIによるCharacter自動選択
- 高度なStory Bible
- Act / Chapter / Scene階層管理
- 複雑なプロット管理
- Timeline管理
- 整合性自動検査
- Agent
- Multi-Agent
- AIによる自動推敲ループ
- 自動採用
- AIによる自動Episode進行
- マルチユーザー
- OAuth
- 独自ログイン
- 共同編集
- 公開共有機能
- コメント
- EPUB生成
- Word出力
- Git同期
- クラウド同期
- 完全オフライン対応

---

## 39. 将来的な拡張候補

V1完成後、必要になった機能だけ追加する。

候補：

### Long-term Story Memory

```text
累積Story Memory
+
直前Episode Summary
```

### Character / Lore自動選択

現在のEpisode Instructionを解析し、必要な設定だけ自動取得する。

### Character画像

Characterごとに基準画像を登録し、スチル生成時に参照画像として使用する。

### 複数モデル比較

同じPromptを複数モデルへ同時送信する。

例：

```text
Claude
GPT
Gemini
```

から好みのGenerationを採用する。

### 部分修正

本文全体ではなく選択範囲のみ再生成する。

### Story Planner

Act / Chapter / Scene構造を追加する。

### Export

Markdown / txt / docx / EPUB。

---

## 40. 受け入れ条件

V1完成と判断する最低条件。

1. スマートフォンからTailscale経由でアクセスできる。
2. PWAとしてホーム画面へ追加できる。
3. 複数Worldを作成できる。
4. Worldごとに基礎執筆指示を保存できる。
5. Worldごとに複数Characterを保存できる。
6. Worldごとに複数Loreを保存できる。
7. Episodeを作成できる。
8. EpisodeごとにCharacterを選択できる。
9. EpisodeごとにLoreを選択できる。
10. 前EpisodeのSummaryを確認・編集できる。
11. Episode Instructionを入力できる。
12. OpenRouter経由で本文生成できる。
13. OpenAI互換APIを利用できる。
14. 生成時にモデルを変更できる。
15. 同一Episodeで複数Generationを保持できる。
16. Generation間を切り替えて確認できる。
17. 任意のGenerationを採用できる。
18. 採用済み本文からSummaryを生成できる。
19. Summaryを手動編集して保存できる。
20. Prompt / Context Previewを確認できる。
21. GenerationごとにPrompt Snapshotが残る。
22. 採用本文からスチル画像を生成できる。
23. 画像Promptと生成画像が保存される。
24. API Keyがブラウザへ露出しない。
25. Docker再起動・更新後もDBと画像が消えない。

---

## 41. 実装優先順位

### Phase 1

- Next.js基本構成
- SQLite
- World CRUD
- Character CRUD
- Lore CRUD
- Episode CRUD

### Phase 2

- OpenRouter Provider
- OpenAI-Compatible Provider
- 本文生成
- Generation保存
- Model選択

### Phase 3

- Generation履歴
- 採用
- Summary生成
- Summary編集

### Phase 4

- Context Preview
- Prompt Snapshot
- Token /文字数表示

### Phase 5

- Image Generation
- Still Library

### Phase 6

- PWA
- スマートフォンUI調整
- Docker
- Caddy
- Tailscale環境へのデプロイ

---

## 42. 開発方針

V1では「将来必要になりそうだから」という理由だけで機能を追加しない。

以下を優先する。

```text
小さい
↓
理解できる
↓
壊れにくい
↓
実際に使える
↓
使って不満が出た部分だけ改善する
```

内部構造についても過度な抽象化を避ける。

ただしAI Provider部分についてのみ、OpenRouterとOpenAI-Compatibleを切り替えられる最低限の抽象化を行う。

---

## 43. V1の最終的なユーザー体験

理想的な利用フローは以下。

```text
PWAを開く
↓
Worldを選ぶ
↓
新しいEpisodeを作る
↓
今回登場するCharacterを選ぶ
↓
必要なLoreを選ぶ
↓
前回Summaryを確認する
↓
今回書きたい内容を入力する
↓
モデルを選ぶ
↓
Generate
↓
気に入らなければ再生成
↓
気に入れば採用
↓
Summary生成
↓
必要ならSummary修正
↓
保存
↓
気に入った場面ならスチル生成
↓
次のEpisodeへ
```

この一連の操作をスマートフォン上で軽快に行えることをV1の最優先目標とする。
