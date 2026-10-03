import fs from 'node:fs/promises';
import { notFound, route } from '@/lib/server/http';
import { getImage, resolveDataPath } from '@/lib/server/repo/images';

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (req, { params }: Ctx) => {
  const image = getImage((await params).id);
  if (!image) throw notFound('スチル');
  const thumb = new URL(req.url).searchParams.get('thumb') === '1' && image.thumbPath;
  const abs = resolveDataPath(thumb ? image.thumbPath! : image.filePath);
  if (!abs) throw notFound('画像ファイル');
  let data: Buffer;
  try {
    data = await fs.readFile(abs);
  } catch {
    throw notFound('画像ファイル');
  }
  return new Response(new Uint8Array(data), {
    headers: {
      'Content-Type': thumb ? 'image/webp' : image.mime,
      'Content-Length': String(data.length),
      // 同じ ID の画像は変わらない
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
});
