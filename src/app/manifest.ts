import type { MetadataRoute } from 'next';

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
// パスで併存させる場合（例: /novel）、Next.js は /novel/ を /novel へリダイレクトするので、
// 起動URLとスコープは末尾のスラッシュなしにそろえる
const root = base || '/';

// デザイン仕様 §8.1。チャットPWAと見分けられるよう theme_color を琥珀にする
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: root,
    name: 'Novel Studio',
    short_name: 'Novel',
    description: 'LLM で小説を書く個人用 PWA',
    start_url: root,
    scope: root,
    display: 'standalone',
    background_color: '#FFFFFF',
    theme_color: '#E3A857',
    lang: 'ja',
    icons: [
      { src: `${base}/icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
      { src: `${base}/icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
      { src: `${base}/icons/maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
