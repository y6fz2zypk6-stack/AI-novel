# デプロイ手順（さくらVPS + Tailscale）

既存のアプリ（チャットPWAなど）と同じサーバーに、小説アプリを**別のポートで**追加する手順です。
既存のアプリの設定は変更しません。

```
[スマホ / PC] ──tailnet──▶ [VPS] Tailscale Serve（HTTPS・tailnet 内だけ）
                                   ├─ :8443  → 既存のアプリ（例：チャットPWA）
                                   └─ :10000 → 127.0.0.1:3100  小説アプリ（今回）
```

- 小説アプリは `127.0.0.1:3100` だけで待ち受けます（公開IPからは届きません）。
- HTTPS は Tailscale Serve に1つ設定を足すだけです。Caddy を新しく立てません。
- ポートが違えば別の「オリジン」になるので、Service Worker・キャッシュ・ホーム画面のアプリが既存のPWAと混ざりません。
- ポート番号（3100 / 10000）は例です。使用中なら別の番号にしてください。

> **公開ドメインの Caddy には載せないでください。** このアプリにはログイン機能がありません（アクセス制御を Tailscale に任せる設計）。
> インターネットから開ける場所に置くと、誰でもあなたの API キーで生成できてしまいます。

---

## 0. いまのサーバーの状態を確認する

VPS に SSH して、次を実行します。

```bash
# 待ち受け中のポートと、使っているプログラム
sudo ss -tlnp

# Tailscale Serve の設定（どのポートが使用中か）
sudo tailscale serve status

# Docker が使えるか
docker ps

# メモリ（ビルドに一時的に約 1.5GB 使う）
free -h
```

| 確認したいこと | どこを見るか |
|---|---|
| 3100 が空いているか | `ss -tlnp` の一覧に `:3100` が無ければ空き |
| 10000 が空いているか | `tailscale serve status` に `:10000` が無ければ空き |
| Docker が使えるか | `docker ps` がエラーにならなければ使える |
| ビルドのメモリが足りるか | `free -h` の `available` と `Swap` の合計が 2GB 以上あれば安心 |

---

## 1. （必要なら）スワップを足す

2GB のVPSで他のアプリも動いている場合、ビルド中にメモリが足りずに `Killed` で止まることがあります。
`free -h` の `Swap:` が `0B` なら、先に 2GB のスワップを足しておきます（1回だけでよい）。

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h      # Swap: 2.0Gi になっていればOK
```

## 2. アプリを動かす（Docker）

```bash
cd ~
git clone https://github.com/y6fz2zypk6-stack/AI-novel.git
cd AI-novel
cp .env.example .env
# API キーを暗号化する鍵を作って .env に書き込む
sed -i "s|^APP_SECRET=.*|APP_SECRET=$(openssl rand -base64 32)|" .env
# ビルドして起動（初回は数分かかる）
docker compose up -d --build
```

確認：

```bash
docker compose ps                              # STATUS が Up になっていればOK
curl -sI http://127.0.0.1:3100 | head -1       # HTTP/1.1 200 OK が出ればOK
```

- データはリポジトリ直下の `data/` に保存されます（コンテナを作り直しても消えません）。
- サーバーを再起動しても自動で起動します（`restart: unless-stopped`）。
- `docker compose` が「そんなコマンドは無い」と言われる場合は、`sudo apt install docker-compose-plugin`（または `docker-compose-v2`）で入れてください。

## 3. HTTPS で開けるようにする（tailnet 内だけ）

```bash
sudo tailscale serve --bg --https=10000 http://127.0.0.1:3100
sudo tailscale serve status
```

`tailscale serve status` に次のような行が増えていればOKです（既存の行はそのまま残ります）。

```
https://<マシン名>.<tailnet名>.ts.net:10000 (tailnet only)
|-- / proxy http://127.0.0.1:3100
```

やめるときは `sudo tailscale serve --https=10000 off`。

> 本文の生成は「サーバー側で生成 → 画面が数百ミリ秒ごとに取りに行く」方式なので、プロキシ側の特別な設定（`flush_interval` など）は不要です。

## 4. スマホでホーム画面に追加する

スマホの Tailscale を ON にしてから：

- iPhone：Safari で `https://<マシン名>.<tailnet名>.ts.net:10000` を開く → 共有 → **ホーム画面に追加**
- Android：Chrome で開く → メニュー → **アプリをインストール**

琥珀色のペン先のアイコンが小説アプリです（既存のPWAとは別のアプリとして並びます）。

## 5. 最初の設定

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
docker compose up -d --build
```

DB の構造が変わる更新でも、起動時に自動で移行します。

## バックアップ

`data/` フォルダの中身がすべてです（Docker が作るので所有者は root。コピーには `sudo` が要ります）。

| ファイル | 中身 |
|---|---|
| `app.sqlite`（と `-wal` `-shm`） | World・人物・ロア・エピソード・候補・要約・設定 |
| `images/` | スチル画像 |
| `secret.key` | 画面から保存した API キーの暗号鍵（`APP_SECRET` 未設定のときだけ作られる） |

アプリを止めてから `data/` ごとまとめるのが確実です。

```bash
cd ~/AI-novel
docker compose stop && sudo tar czf ~/novel-backup-$(date +%Y%m%d).tgz data .env && docker compose start
```

`.env` の `APP_SECRET`（または `secret.key`）を失うと、保存した API キーだけが読めなくなります（入力し直せば直ります）。

---

## Docker を使わない場合（Node.js で直接動かす）

Node.js 22 以上が必要です（`node -v` で確認）。

```bash
cd ~/AI-novel
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
```

`PORT` と `HOST` は `.env` ではなく、上のように起動時の環境変数で指定します（Next.js は `.env` を読む前にポートを決めるため）。
更新は `git pull && npm ci && npm run build && sudo systemctl restart novel-studio`。

## パスで併存させる場合（別ポートが使えないとき）

`https://…ts.net:8443/novel` のように、既存のアプリと同じポートのパスで分けることもできます。ただし同じオリジンになるため、
既存のPWAの Service Worker（スコープ `/`）が小説アプリへの通信にも介在します。できるだけ別ポートをおすすめします。

1. `.env` に `NEXT_PUBLIC_BASE_PATH=/novel` を書き、作り直す（`docker compose up -d --build`）
2. HTTPS 側で `/novel` 以下を、パスを削らずに `127.0.0.1:3100` へ転送する

## 困ったとき

| 症状 | 確認すること |
|---|---|
| ビルドが `Killed` / `exit code: 137` で止まる | メモリ不足。1 のスワップを足してからもう一度 `docker compose up -d --build` |
| 画面が開かない | `curl -sI http://127.0.0.1:3100` が返るか。返らなければ `docker compose logs -f` |
| スマホで開けない | スマホの Tailscale が ON か。`sudo tailscale serve status` に `:10000` があるか |
| 3100 が使用中と言われる | `.env` の `NOVEL_PORT` を別の番号にし、3 の転送先（`http://127.0.0.1:◯◯◯◯`）も合わせる |
| 生成がエラーになる | エラーの文言（APIキー無効・レート制限・コンテキスト長超過など）を確認。Settings の **接続テスト** |
