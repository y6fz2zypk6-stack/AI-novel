import { NextResponse, type NextRequest } from 'next/server';

// アプリ独自のログインは持たない（アクセス制御は Tailscale に任せる）。
// ただし、ブラウザで開いた別サイトから API を叩かれないように、
// 書き込み系のリクエストは同じオリジンからのものだけ受け付ける。
export function proxy(req: NextRequest) {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return NextResponse.next();

  const site = req.headers.get('sec-fetch-site');
  if (site) {
    if (site === 'same-origin' || site === 'none') return NextResponse.next();
    return forbidden();
  }
  // Sec-Fetch-Site を送らない古いブラウザ向け。Origin があればホストを比べる
  const origin = req.headers.get('origin');
  if (origin) {
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
    try {
      if (new URL(origin).host !== host) return forbidden();
    } catch {
      return forbidden();
    }
  }
  return NextResponse.next();
}

function forbidden() {
  return NextResponse.json({ error: '別のサイトからの操作は受け付けません' }, { status: 403 });
}

export const config = {
  matcher: '/api/:path*',
};
