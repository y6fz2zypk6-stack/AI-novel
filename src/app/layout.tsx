import type { Metadata, Viewport } from 'next';
import { Shippori_Mincho, Zen_Kaku_Gothic_New } from 'next/font/google';
import { cookies } from 'next/headers';
import { TabBar } from '@/components/chrome';
import { ServiceWorker } from '@/components/ServiceWorker';
import './globals.css';

// UI はゴシック、本文は明朝（デザイン仕様 §2.2）
// 日本語フォントは文字の範囲ごとに分割された数百のファイルからなる。
// preload すると全部を最初に取りに行ってしまうので、使う文字の分だけ読み込ませる
const ui = Zen_Kaku_Gothic_New({
  weight: ['400', '500', '700'],
  subsets: ['latin'],
  variable: '--font-zen-kaku',
  display: 'swap',
  preload: false,
});

const prose = Shippori_Mincho({
  weight: ['400', '600'],
  subsets: ['latin'],
  variable: '--font-shippori',
  display: 'swap',
  preload: false,
});

export const metadata: Metadata = {
  title: { default: 'Novel Studio', template: '%s · Novel Studio' },
  description: 'LLM で小説を書く個人用 PWA',
  applicationName: 'Novel Studio',
  appleWebApp: { capable: true, title: 'Novel', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#E3A857',
};

// すべての画面は DB の内容を毎回読む
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const worldId = store.get('novel_world')?.value ?? null;
  return (
    <html lang="ja" className={`${ui.variable} ${prose.variable}`}>
      <body>
        {children}
        <TabBar initialWorldId={worldId} />
        <ServiceWorker />
      </body>
    </html>
  );
}
