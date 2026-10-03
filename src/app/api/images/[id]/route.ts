import { json, notFound, route } from '@/lib/server/http';
import { deleteImage, getImage } from '@/lib/server/repo/images';

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = route(async (_req, { params }: Ctx) => {
  const { id } = await params;
  if (!getImage(id)) throw notFound('スチル');
  deleteImage(id);
  return json({ ok: true });
});
