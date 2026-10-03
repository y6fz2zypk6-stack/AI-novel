// アプリアイコンを生成する（デザイン仕様 §8.1）。
// 琥珀色の地に、白い線で描いたペン先。チャットPWAのアイコンとは色も形も変える。
//   npm run icons
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const AMBER = '#E3A857';

/** scale: 絵柄の大きさ（maskable はセーフゾーンに収めるため小さくする） */
function svg(scale) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${AMBER}"/>
  <g transform="translate(256 256) scale(${scale}) rotate(45) translate(-256 -262)"
     fill="none" stroke="#FFFFFF" stroke-width="20" stroke-linecap="round" stroke-linejoin="round">
    <path d="M204 160 C 178 228, 204 312, 256 392 C 308 312, 334 228, 308 160 Z"/>
    <path d="M256 392 L 256 272"/>
    <circle cx="256" cy="252" r="16"/>
    <path d="M214 160 L 214 118 L 298 118 L 298 160"/>
  </g>
</svg>`;
}

async function png(scale, size, out) {
  await sharp(Buffer.from(svg(scale))).resize(size, size).png({ compressionLevel: 9 }).toFile(out);
  console.log('wrote', out);
}

mkdirSync('public/icons', { recursive: true });
await png(1.2, 192, 'public/icons/icon-192.png');
await png(1.2, 512, 'public/icons/icon-512.png');
await png(0.95, 512, 'public/icons/maskable-512.png');
await png(1.2, 192, 'src/app/icon.png');
// iOS のホーム画面。角丸は iOS が付ける
await png(1.1, 180, 'src/app/apple-icon.png');
