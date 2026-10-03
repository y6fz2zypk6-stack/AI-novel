# デプロイ手順（さくらVPS + Tailscale）

既存のチャットPWAと同じサーバーに、**別のポートで**小説アプリを追加する手順です。
チャットPWAの設定は変更しません。

```
[スマホ / PC] ──tailnet──▶ [VPS] Tailscale Serve または Caddy（HTTPS）
                                   ├─ :443  → 127.0.0.1:3000  チャットPWA（既存）
                                   └─ :8443 → 127.0.0.1:3100  小説アプリ（今回）
```

- 小説アプリは `127.0.0.1:3100` だけで待ち受けます（公開IPからは届きません）。
- HTTPS は既存の仕組み（Tailscale Serve または Caddy）に1つ設定を足すだけです。Caddy を新しく立てません。
- ポートが違えば別の「オリジン」になるので、Service Worker・キャッシュ・ホーム画面のアプリがチャットPWAと混ざりません。

ポート番号（3100 / 8443）は例です。空いていれば変えずにそのまま使えます。

---

## 0. いまのサーバーの状態を確認する

VPS に SSH して、次を実行します。結果に API キーなどが出たら伏せてから共有してください。

```bash
# Node.js の場所とバージョン（このアプリは Node.js 22 以上が必要）
which node; node -v

# 待ち受け中のポートと、使っているプログラム（3000 や 443 が誰のものかわかる）
sudo ss -tlnp

# Caddy を使っているか・設定内容
systemctl status caddy --no-pager
cat /etc/caddy/Caddyfile

# Tailscale Serve を使っているか
tailscale status
sudo tailscale serve status

# チャットPWAの起動方法（Docker / pm2 / systemd のどれか）
docker ps 2>/dev/null
pm2 list 2>/dev/null
systemctl list-units --type=service --state=running --no-pager | grep -iE "node|chat|caddy"
```

見るところ：

| 確認したいこと | どこを見るか |
|---|---|
| HTTPS をどちらでやっているか | `tailscale serve status` に `https://…:443` があれば Tailscale Serve。Caddyfile に `ts.net` のサイトがあれば Caddy |
| 3100 / 8443 が空いているか | `ss -tlnp` の一覧に `:3100` `:8443` が無ければ空き |
| Docker が使えるか | `docker ps` がエラーにならなければ使える |

---

## 1. アプリを動かす（A か B のどちらか）

### A. Docker で動かす（Docker が入っている場合はこちらが簡単）

```bash
git clone https://github.com/y6fz2zypk6-stack/AI-novel.git ~/AI-novel
cd ~/AI-novel
cp .env.example .env
nano .env        # APP_SECRET を設定（openssl rand -base64 32 の出力など）
docker compose up -d --build
```

確認：

```bash
docker compose ps
curl -sI http://127.0.0.1:3100 | head -1     # HTTP/1.1 200 OK が出ればOK
```

データはリポジトリ直下の `data/` に保存されます（コンテナを作り直しても消えません）。

### B. Node.js で直接動かす（チャットPWAと同じやり方）

Node.js 22 以上が必要です（`node -v` で確認。古い場合は A を使うか、Node.js を更新してください）。

```bash
git clone https://github.com/y6fz2zypk6-stack/AI-novel.git ~/AI-novel
cd ~/AI-novel
cp .env.example .env
nano .env        # APP_SECRET を設定
npm ci
npm run build
npm start        # 127.0.0.1:3100 で起動。確認できたら Ctrl+C で止める
```

常駐させるには systemd に登録します（`<ユーザー名>` と npm のパスは自分の環境に合わせる。npm のパスは `which npm` で確認）。

```bash
sudo tee /etc/systemd/system/novel-studio.service > /dev/null <<'EOF'
[Unit]
Description=Novel Studio
After=network-online.target

[Service]
Type=simple
User=<ユーザー名>
WorkingDirectory=/home/<ユーザー名>/AI-novel
Environment=NODE_ENV=production
Environment=HOST=127.0.0.1
Environment=PORT=3100
ExecStart=/usr/bin/npm start
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now novel-studio
systemctl status novel-studio --no-pager
```

> `PORT` と `HOST` は `.env` ではなく、上のように起動時の環境変数で指定します（Next.js は `.env` を読む前にポートを決めるため）。

---

## 2. HTTPS で開けるようにする（tailnet 内だけ）

0 の確認結果に合わせて、どちらか一方を行います。

### Tailscale Serve を使っている場合

```bash
sudo tailscale serve --bg --https=8443 http://127.0.0.1:3100
sudo tailscale serve status
```

`https://<マシン名>.<tailnet名>.ts.net:8443` で開けます（チャットPWAの `:443` の設定はそのまま残ります）。
やめるときは `sudo tailscale serve --https=8443 off`。

### Caddy を使っている場合

`/etc/caddy/Caddyfile` の末尾に1ブロック足します（既存のブロックは触らない）。

```caddyfile
<マシン名>.<tailnet名>.ts.net:8443 {
	reverse_proxy 127.0.0.1:3100
}
```

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

- 証明書は、チャットPWAのブロックと同じ仕組み（Caddy が tailscaled から `*.ts.net` の証明書を取得）で用意されます。
- 本文の生成は「サーバー側で生成 → 画面が数百ミリ秒ごとに取りに行く」方式なので、`flush_interval` の設定は不要です。

---

## 3. スマホでホーム画面に追加する

- iPhone：Safari で `https://…ts.net:8443` を開く → 共有 → **ホーム画面に追加**
- Android：Chrome で開く → メニュー → **アプリをインストール**

琥珀色のペン先のアイコンが小説アプリです（チャットPWAとは別のアプリとして並びます）。

## 4. 最初の設定

1. **Settings → PROVIDER → OpenRouter** を開き、API キーを入力して保存 → **接続テスト**
2. **Settings → 既定モデル** で、執筆・要約・画像のモデルを選ぶ（一覧から検索、またはIDを直接入力）
3. **Worlds → ＋新しいWorld** から書き始める

`.env` に `OPENROUTER_API_KEY` を書いておく方法もあります（画面から保存したキーが優先されます）。
API キーはサーバーにだけ保存され、ブラウザには伏せ字（`sk-or-••••••••3f2a`）しか返しません。

---

## 更新するとき

```bash
cd ~/AI-novel
git pull
# A. Docker
docker compose up -d --build
# B. Node.js
npm ci && npm run build && sudo systemctl restart novel-studio
```

DB の構造が変わる更新でも、起動時に自動で移行します。

## バックアップ

`data/` フォルダの中身がすべてです。

| ファイル | 中身 |
|---|---|
| `app.sqlite`（と `-wal` `-shm`） | World・人物・ロア・エピソード・候補・要約・設定 |
| `images/` | スチル画像 |
| `secret.key` | 画面から保存した API キーの暗号鍵（`APP_SECRET` 未設定のとき） |

アプリを止めてから `data/` ごとコピーするのが確実です。

```bash
# A. Docker
docker compose stop && tar czf ~/novel-backup-$(date +%Y%m%d).tgz data && docker compose start
# B. Node.js
sudo systemctl stop novel-studio && tar czf ~/novel-backup-$(date +%Y%m%d).tgz data && sudo systemctl start novel-studio
```

`secret.key`（または `APP_SECRET`）を失うと、保存した API キーだけが読めなくなります（入力し直せば直ります）。

## パスで併存させる場合（別ポートが使えないとき）

`https://…ts.net/novel` のように同じポートのパスで分けることもできます。ただし同じオリジンになるため、
チャットPWAの Service Worker（スコープ `/`）が小説アプリへの通信にも介在します。できるだけ別ポートをおすすめします。

1. `.env` に `NEXT_PUBLIC_BASE_PATH=/novel` を書き、作り直す（`npm run build` / `docker compose up -d --build`）
2. HTTPS 側で `/novel` 以下をそのまま（パスを削らずに）`127.0.0.1:3100` へ転送する
   - Caddy なら、チャットPWAのブロックの中に `handle /novel* { reverse_proxy 127.0.0.1:3100 }` を足す
     （`handle_path` はパスを削るので使わない）
   - Tailscale Serve の場合の書き方は、サーバーの設定を見てから一緒に確認します

## 困ったとき

| 症状 | 確認すること |
|---|---|
| 画面が開かない | `curl -sI http://127.0.0.1:3100` が返るか。返らなければアプリのログ（`docker compose logs -f` / `journalctl -u novel-studio -f`） |
| 3100 が使用中と言われる | `.env` の `NOVEL_PORT`（Docker）や systemd の `PORT` を別の番号にし、HTTPS 側の転送先も合わせる |
| 生成がエラーになる | エラーの文言（APIキー無効・レート制限・コンテキスト長超過など）を確認。Settings の **接続テスト** |
| `node -v` が 22 未満 | Docker（A）を使うか、Node.js 22 以上に更新する |
