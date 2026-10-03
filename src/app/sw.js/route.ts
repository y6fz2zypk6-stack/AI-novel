// Service Worker 本体（/sw.js）。ビルドごとにキャッシュ名が変わるよう、ここで組み立てて返す。
// 完全なオフライン対応はしない（機能仕様 §32）。ハッシュ付きの静的ファイルとアイコンだけをキャッシュする。

const BUILD = process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev';
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

const script = `
const PREFIX = 'novel-v1-';
const STATIC_CACHE = PREFIX + 'static-' + ${JSON.stringify(BUILD)};
const BASE = ${JSON.stringify(BASE)};

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      // チャットPWAなど他のアプリのキャッシュには触らない（接頭辞で区別する）
      await Promise.all(
        keys.filter((k) => k.startsWith(PREFIX) && k !== STATIC_CACHE).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

const OFFLINE_HTML =
  '<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>オフライン</title><body style="font-family:sans-serif;padding:32px 20px;color:#1F1E1C">' +
  '<p>オフラインです。接続を確認してから、もう一度開いてください。</p></body></html>';

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(
        () => new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
      ),
    );
    return;
  }

  const path = url.pathname;
  const cacheable = path.startsWith(BASE + '/_next/static/') || path.startsWith(BASE + '/icons/');
  if (!cacheable) return; // API などは常にネットワークへ

  event.respondWith(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })(),
  );
});
`;

export function GET() {
  return new Response(script, {
    headers: {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cache-Control': 'no-cache',
      // basePath（例: /novel）のとき、/novel/sw.js から /novel 全体を受け持てるようにする
      'Service-Worker-Allowed': BASE || '/',
    },
  });
}
