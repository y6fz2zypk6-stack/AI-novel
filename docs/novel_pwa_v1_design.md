# 小説生成PWA V1 デザイン仕様書

本書は `novel_pwa_v1_spec.md`（機能仕様）に対応するUI／ビジュアルデザイン仕様である。
機能・データ構造は機能仕様を正とし、本書は「どう見せるか・どう配置するか」を定める。

---

## 1. デザイン方針

- **スマートフォン最優先**。基準幅は 390px（iPhone 標準幅）。PCでは中央寄せで最大幅 640px 程度に収める。
- **白基調・静かな画面**。本文を読む／書く道具として、装飾を抑える。
- **アクセントは琥珀色ひとつだけ**。「生成」「採用」「保存」など *前へ進む操作* にのみ使う。
- **主要操作は画面下部**（親指の届く範囲）に固定する。
- **UIはゴシック、本文は明朝**。読む領域と操作する領域を書体で分ける。
- 機能仕様 §42 に従い、装飾・アニメーションは最小限にとどめる。

---

## 2. デザイントークン

### 2.1 カラー

| トークン | 値 | 用途 |
|---|---|---|
| `bg` | `#FFFFFF` | ページ背景 |
| `surface` | `#F5F4F1` | カード、入力欄（非フォーカス）、セカンダリボタン |
| `surface-2` | `#ECEAE6` | バッジ背景、トラック（バーの下地） |
| `surface-tab` | `#F0EEEA` | セグメントタブの下地 |
| `bar` | `#FAF9F7` | 下部タブバー背景 |
| `line` | `#E2E0DB` | 枠線、区切り線 |
| `line-strong` | `#CFCCC6` | 主要テキストエリアの枠、点線プレースホルダ、非アクティブドット |
| `text` | `#1F1E1C` | 本文・見出し |
| `text-prose` | `#2B2A27` | 生成本文（明朝） |
| `text-sub` | `#3A3834` | 要約プレビュー、コード表示 |
| `muted` | `#6B6862` | ラベル、補足、メタ情報 |
| `tab-inactive` | `#77736C` | 非選択タブのアイコンと文字 |
| `accent` | `#E3A857` | プライマリボタン塗り、選択枠、プログレス |
| `on-accent` | `#2A1A04` | accent 上の文字 |
| `accent-ink` | `#9A5B0C` | リンク、選択中タブ、accent 系の文字（白上でコントラストを確保） |
| `accent-ink-strong` | `#7A4608` | リンクの hover、選択チップの文字 |
| `accent-soft` | `#FBEBD3` | 選択チップの背景 |
| `accent-banner` | `#FDF4E6` | 採用バナーの背景（枠は `#EBC48A`） |
| `ok` | `#2E9D5B` | 接続済みインジケータ |
| `neutral-bar` | `#A9A59E` | Context Preview の通常バー、未接続インジケータ |
| `scrim` | `#8F8C86` | ボトムシート背面の暗幕（実装では `rgba(0,0,0,.4)` でも可） |

**ルール**
- 明るい `accent` (#E3A857) を **文字色として白背景に置かない**（コントラスト不足）。文字には `accent-ink` を使う。
- エラー色はV1で1色のみ追加する：`danger` `#B3261E`（文字・枠）／`danger-soft` `#FCEDEC`（背景）。

### 2.2 タイポグラフィ

フォント（Google Fonts）：

```
Zen Kaku Gothic New : 400 / 500 / 700   … UI全般
Shippori Mincho     : 400 / 600         … 生成本文、World名、Worlds見出し
等幅                : ui-monospace, SFMono-Regular, Menlo, monospace … Context全文
```

`next/font/google` で読み込み、CSS変数 `--font-ui` `--font-prose` として定義する。

| 役割 | 書体 | サイズ | 太さ | 行間 |
|---|---|---|---|---|
| 画面タイトル（Episode 12 等） | UI | 22px | 700 | 1.3 |
| Worlds 見出し | 明朝 | 30px | 600 | 1.3（字間 0.04em） |
| World名（カード） | 明朝 | 20–22px | 600 | 1.4 |
| セクション見出し | UI | 15px | 700 | 1.4 |
| フィールドラベル | UI | 12–13px | 500 | 1.4（色 `muted`） |
| 入力文字 | UI | 15–16px | 400 | 1.7 |
| チップ・ボタン | UI | 14–17px | 400/700 | 1 |
| メタ情報 | UI | 12px | 400 | 1.4（色 `muted`） |
| タブバー | UI | 11px | 400（選択時 700） | 1 |
| **生成本文** | **明朝** | **15px** | 400 | **1.9** |

- 入力欄は **16px 未満にしない** こと（iOSのフォーカス時ズームを防ぐ）。ただしテキストエリアは15pxでも可（ズームが気になる場合は16pxにする）。
- 生成本文の段落：`margin-bottom: 0.9em`。地の文の段落は `text-indent: 1em`、会話文（「で始まる段落）は字下げしない。
- 本文サイズは将来、設定で 13–19px の範囲を変えられるように CSS 変数 `--prose-size` で持つ。

### 2.3 スペーシング・角丸・サイズ

| 項目 | 値 |
|---|---|
| 画面の左右余白 | 16px（本文表示領域のみ 24px） |
| セクション間 | 14–22px |
| 要素間 gap | 8–10px |
| 角丸：チップ | 20px（完全な丸形） |
| 角丸：入力欄・ボタン | 12–14px |
| 角丸：カード | 14–16px |
| 角丸：ボトムシート上端 | 22px |
| **最小タップ領域** | **44×44px**（チップは高さ40px、横に余白を取る） |
| プライマリボタン高さ | 52–56px |
| 下部タブバー高さ | 76px（`padding-bottom: env(safe-area-inset-bottom)` を加算） |

### 2.4 アイコン

- 線のアイコン（stroke 1.6–1.8px、`currentColor`）。lucide-react を推奨する。
- 絵文字はUIに使わない。
- アイコンだけのボタンには必ず `aria-label` を付ける。

| 用途 | lucide 名（目安） |
|---|---|
| Worlds | `globe` |
| Write | `pen-line` |
| Library | `book` |
| Settings | `sliders-horizontal` |
| 生成履歴 | `history` |
| 再生成 | `rotate-cw` |
| 修正指示 | `message-square-text` |
| 採用 | `check` |
| Context / Snapshot | `align-left` |
| スチル | `image` |
| 戻る / 次 | `chevron-left` / `chevron-right` |

---

## 3. レイアウト骨格

```
┌──────────────────────┐
│ Header                │  World名（小・リンク） + 画面タイトル + 右に補助ボタン
├──────────────────────┤
│                        │
│ Scroll Content         │  縦スクロールのみ。横スクロールは禁止
│                        │
├──────────────────────┤
│ Action Dock（任意）    │  主要操作。position: sticky; bottom
├──────────────────────┤
│ Tab Bar                │  Worlds / Write / Library / Settings
└──────────────────────┘
```

- Header の World 名（例：「学園ミステリー ⌄」）をタップすると Worlds へ移動する。**現在のWorldは常に画面上部に表示する**。
- 候補確認・採用後の画面は Write の下層画面とし、**Tab Bar を隠して Action Dock だけを出す**（本文表示の領域を広く取るため）。
- PC（≥768px）：コンテンツを `max-width: 640px; margin: 0 auto`。タブバーも同じ幅にそろえる。サイドバーは作らない。

---

## 4. 共通コンポーネント

### 4.1 Button

| 種類 | 見た目 |
|---|---|
| Primary | 背景 `accent`、文字 `on-accent`、700、枠なし |
| Secondary | 背景 `surface`、枠 `line`、文字 `text` |
| Outline-accent | 背景透明、枠1.5px `accent`、文字 `accent-ink`（「次のエピソードへ」） |
| Icon | 44×44、枠 `line`、背景 `surface` |
| Dock縦型 | 76×56、アイコンの下に11pxのラベル（再生成・修正指示） |

- 実行中は `disabled` にしてスピナーと文言（例：「生成中…」）を出す。二重送信を防ぐ。
- **1画面にPrimaryは原則1つ**。

### 4.2 Chip（Character / Lore 選択）

- `<button aria-pressed>` で実装する。チェックボックスの一覧は使わない。
- 選択時：背景 `accent-soft`、枠 `accent`、文字 `accent-ink-strong`、先頭に ✓ アイコン。
- 非選択時：背景 `surface`、枠 `line`、文字 `muted`。
- `flex-wrap: wrap; gap: 8px`。セクション見出しの右に「2 / 3 選択」を表示する。
- 件数が多い場合（目安12件以上）は「すべて表示」で折りたたむ。

### 4.3 Input / Textarea

- 通常の入力欄：背景 `surface`、枠 `line`、高さ44px。
- 主要なテキストエリア（今回の指示、要約編集）：背景 `bg`、枠 `line-strong`。他の欄より目立たせる。
- フォーカス時：枠 `accent` ＋ `box-shadow: 0 0 0 3px rgba(227,168,87,.25)`。
- ラベルは必ず `<label for>` で関連付ける。

### 4.4 Card

- 背景 `surface`、枠 `line`、角丸14–16px、padding 14–16px。
- 強調するカード（作業中のWorld）：背景 `bg`、枠1.5px `accent`、左上に「作業中」バッジ（塗り `accent`）。
- **左側だけ太い枠線のカードは使わない**。

### 4.5 Segmented Tabs（Library）

- 下地 `surface-tab`、内側の余白4px、4等分のグリッド。
- 選択中：背景 `bg`、文字 `text` 700、`box-shadow: 0 1px 2px rgba(0,0,0,.08)`。
- `role="tablist"` / `role="tab"` / `aria-selected` を付ける。

### 4.6 Tab Bar

- 4タブ。アイコン22px ＋ ラベル11px。
- 選択中は `accent-ink` かつ 700、`aria-current="page"`。
- 背景 `bar`、上端に1pxの `line`。

### 4.7 Bottom Sheet（Context Preview、修正指示、モデル選択）

- 上端の角丸22px。中央上にハンドル（40×5、`line-strong`）。
- 背面に暗幕を敷き、暗幕のタップ・右上の×・下スワイプで閉じる。
- 高さは画面の約88%まで。中身はシート内でスクロールさせる。

### 4.8 Banner（状態通知）

- 採用済み：背景 `accent-banner`、枠 `#EBC48A`、✓ アイコンと文字は `accent-ink`、右端に「変更」リンク。
- エラー：背景 `danger-soft`、枠と文字は `danger`、右端に「再試行」ボタン。

---

## 5. 画面別仕様

### 5.1 Worlds

- 見出し「Worlds」（明朝30px）と、補足「書く世界を選んでください」。
- World カード：World名（明朝）、説明（2行で省略）、メタ行（`Ep.12 · 人物 3 · ロア 3 · 最終更新`）。
- カード本体のタップ → そのWorldを作業対象にして Write へ移動する。右上の鉛筆アイコン → World編集。
- 作業中のWorld は強調カード（§4.4）で表示する。
- 一覧の最後に点線のボタン「＋ 新しいWorld」を置く。
- World編集画面は全画面のフォームで、名前・説明・基礎執筆指示（大きいテキストエリア）を入力し、下部に「保存」を固定する。

### 5.2 Write — 生成前（メイン画面）

上から順に：

1. **Header**：World名リンク／`Episode 12`／右に生成履歴ボタン
2. **タイトル ＋ モデル**を横に並べる（タイトルは可変幅、モデルは132px固定）。モデルは「既定（執筆）」と表示し、タップでモデル選択のシートを開く。
3. **登場人物**：チップ（§4.2）
4. **ロア**：チップ
5. **前回までの要約**：カード。見出し「前回までの要約 · Ep.11」、本文は2行で省略、右に「編集」。編集は全画面またはシートで開く。
6. **今回の指示**：テキストエリア（高さ150px以上、入力に応じて伸びる）

**Action Dock（固定）**
- 左：Context ボタン（2段表示：「Context」11px / 「約4,090 tok」14px）→ Context Preview のシート
- 右：Primary「✎ 本文を生成」（残りの幅いっぱい）

入力内容は数秒ごとに下書きとして自動保存する。生成に失敗しても入力内容を失わないこと（機能仕様 §35）。

### 5.3 Write — 候補確認

- **Header**：戻る／`Episode 12` ＋ タイトル／右にこの候補の Prompt Snapshot ボタン
- **候補ページャー**：カード内に `[←]  候補 2 / 4  [→]`。その下に点のインジケータ（現在位置は幅18pxの `accent`、他は6pxの `line-strong`）。
- **メタ行**：`model-id · temp 0.8 · 3,812字 · 18:12`
- **本文**：明朝15px／行間1.9／左右余白24px。この領域だけが縦スクロールする。
- 左右スワイプでも候補を切り替えられるとよい（任意）。
- **Action Dock**：`[再生成]` `[修正指示]`（縦型）＋ Primary「✓ この本文を採用」
- 採用済みの候補を表示しているときは、Primary を「採用中」（無効化、✓付き）にする。
- **修正指示**：ボトムシートにテキストエリアと「この指示で再生成」(Primary) を置く。

**生成中の表示**
- ページャーに新しい候補（例：5 / 5）を追加し、本文の領域に「生成中…」を表示する。ストリーミングに対応する場合は、文字が届くたびに本文へ追記する。
- 生成中も、既存の候補には戻って読める。

### 5.4 Write — 採用後

- **採用バナー**：「候補 2 を採用しました」＋「変更」（→ 候補確認へ）
- **次話用の要約**：見出しの右に状態バッジを出す。
  - `未保存・AI生成`（`surface-2`）→ 保存後は `保存済み`
- 要約テキストエリア（高さ約270px）。下に `[要約を再生成]`(Secondary) と `[保存]`(Primary) を並べる。
- **スチル**：生成済みのサムネイル（112×150、縦長） ＋ 「この場面のスチルを生成」の大きなボタン（補足「場面は本文から自動作成」）。押すとシートが開き、追加指示・画像モデル・生成ボタンを置く。
- **Action Dock**：Outline-accent「次のエピソードへ →」

### 5.5 Context Preview（ボトムシート）

- タイトル「Context Preview」＋閉じるボタン。
- セクションごとの行：`名前`（人物とロアは件数付き）／`トークン数`（右寄せ）、その下に高さ6pxの横バー。
  - バーの長さは **一番大きいセクションを100%** とした比率。
  - 一番大きいセクションだけ `accent` で塗り、数値も `accent-ink` の太字にする。他は `neutral-bar`。
- 合計行：「合計（推定）」／ `4,090 tokens`（22px 700）
- 全文：等幅12px、背景 `surface`。右上に「コピー」。展開すると全文を表示する。
- トークン数が推定できない Provider では、単位を「字」に切り替える。
- 生成履歴から開いた場合は Prompt Snapshot を表示し、見出しに「Snapshot · 18:12」と出す。

### 5.6 Library

- Header：World名リンク／「Library」／右に Primary の小ボタン「＋ 追加」
- セグメントタブ：`人物 / ロア / 話 / スチル`
- 人物・ロア：カード一覧（名前、文字数、内容の冒頭2行）。タップで全画面の編集（名前の入力欄と内容のテキストエリア、下部に保存を固定）。
- 話：エピソード番号、タイトル、採用済みかどうか、要約が保存済みかどうかを一覧で表示する。
- スチル：2列のグリッドで縦長サムネイルを並べる。タップで拡大し、Promptとモデルを表示する。

### 5.7 Settings

- グループ化したリストの形式（見出しは12pxの `muted`、字間 0.06em）。
- **PROVIDER**：行ごとに接続状態の点（`ok` / `neutral-bar`）、名前、補足（マスクしたキーまたはBase URL）、› を表示する。
  - API Key は `sk-or-••••••••3f2a` の形式でのみ表示する（全文は表示しない）。
- **既定モデル**：執筆／要約／画像。右側にモデルIDと ›。
- **生成パラメータ**：Temperature（range、`accent-color: #C98A2E`、現在値を右に表示）、Max Tokens（数値入力、右寄せ）
- 末尾にバージョン表示。

---

## 6. 状態とフィードバック

| 状態 | 表示 |
|---|---|
| 読み込み中 | スケルトン（`surface` の矩形）。スピナーを全画面に出さない |
| 生成中 | ボタンを無効化して「生成中…」。本文の領域に経過表示。ストリーミング時は逐次表示 |
| 成功（保存） | ボタンの文言を一時的に「保存しました ✓」にする（1.5秒）。トーストは最小限にする |
| エラー | 該当箇所の上にエラーバナー（§4.8）。原因の文言（APIキー無効、レート制限、コンテキスト長超過など。機能仕様 §35）と「再試行」を表示。**入力と既存の候補は保持する** |
| 空の状態 | 1行の説明と Primary を1つ（例：「まだ人物がいません」＋「＋ 人物を追加」） |

---

## 7. アクセシビリティ

- 文字のコントラストは 4.5:1 以上（`muted` #6B6862 は白背景で約5.3:1）。
- 選択状態を色だけで表さない（✓アイコン、太字、`aria-pressed`、`aria-selected` を併用する）。
- ボタン・リンクは本物の `<button>` / `<a>` を使う。div にクリック処理を付けない。
- `prefers-reduced-motion` のときは、シートやページャーのアニメーションを止める。

---

## 8. PWA・既存チャットPWAとの併存

### 8.1 manifest

```json
{
  "id": "/",
  "name": "Novel Studio",
  "short_name": "Novel",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#FFFFFF",
  "theme_color": "#E3A857",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- 名前は仮。`theme_color` は琥珀にして、チャットPWAとホーム画面やタスク切替で見分けられるようにする（白にしたい場合は `#FFFFFF`）。
- アイコン：琥珀色の地に、白い線で描いたペン先または本のモチーフ。チャットPWAのアイコンとは色も形も変える。
- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` を指定し、セーフエリアは `env(safe-area-inset-*)` で処理する。

### 8.2 併存のルール

- **オリジンを分ける**（推奨）。Tailscale の MagicDNS ではサブドメインが使えないため、Tailscale Serve で **別ポート** を割り当てる（例：`https://<vps>.<tailnet>.ts.net:8443`）。Service Worker、キャッシュ、manifest がチャットPWAと干渉しない。
- パスで分ける場合（`/novel`）は、Next.js の `basePath`、Service Worker の `scope`、manifest の `id`・`start_url`・`scope` をすべて `/novel/` にそろえる。
- Service Worker のキャッシュ名には必ず接頭辞を付ける（例：`novel-v1-static`）。
- **Caddy を新しく立てない**。既存の Caddy（または Tailscale Serve）にサイト設定を1つ追加する。小説アプリの docker-compose には `app` のみを置く（機能仕様 §37 の `caddy` サービスは既存のものを流用する）。
- ストリーミング生成を行う場合は、Caddy の `reverse_proxy` に `flush_interval -1` を設定する。

---

## 9. Tailwind 設定例

```ts
// tailwind.config.ts（抜粋）
export default {
  theme: {
    extend: {
      colors: {
        bg: '#FFFFFF',
        surface: { DEFAULT: '#F5F4F1', 2: '#ECEAE6', tab: '#F0EEEA' },
        bar: '#FAF9F7',
        line: { DEFAULT: '#E2E0DB', strong: '#CFCCC6' },
        ink: { DEFAULT: '#1F1E1C', prose: '#2B2A27', sub: '#3A3834', muted: '#6B6862', tab: '#77736C' },
        accent: {
          DEFAULT: '#E3A857', on: '#2A1A04', ink: '#9A5B0C', strong: '#7A4608',
          soft: '#FBEBD3', banner: '#FDF4E6', bannerLine: '#EBC48A',
        },
        ok: '#2E9D5B',
        danger: { DEFAULT: '#B3261E', soft: '#FCEDEC' },
      },
      fontFamily: {
        ui: ['var(--font-ui)', 'sans-serif'],
        prose: ['var(--font-prose)', 'serif'],
      },
      borderRadius: { chip: '20px', field: '12px', card: '16px', sheet: '22px' },
    },
  },
}
```

```css
/* globals.css（抜粋） */
:root { --prose-size: 15px; }
.prose-jp { font-family: var(--font-prose); font-size: var(--prose-size); line-height: 1.9; color: #2B2A27; }
.prose-jp p { margin: 0 0 .9em; }
.prose-jp p.narration { text-indent: 1em; }
```

---

## 10. 実装メモ（Claude Code 向け）

- 画面とルートの対応例：
  - `/` → Worlds
  - `/w/[worldId]/write` → 生成前
  - `/w/[worldId]/episodes/[episodeId]` → 候補確認／採用後（状態で切り替える）
  - `/w/[worldId]/library?tab=characters`
  - `/settings`
- 「現在のWorld」は URL に持たせ、最後に使ったWorldを cookie に記録しておき、`/` からそのWorldへ自動で移動させてもよい。
- 生成本文の段落分け：本文を改行で分割し、`「` `『` で始まる行は字下げなし、それ以外は `narration` クラスを付ける。
- デザインのモックアップ（Design キャンバス「小説生成PWA デザイン」）を見た目の正とし、本書の数値と食い違う場合は本書を優先する。
