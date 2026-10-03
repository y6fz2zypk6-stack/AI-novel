import { json, notFound, optString, readBody, reqString, route } from '@/lib/server/http';
import { deleteLore, getLore, updateLore } from '@/lib/server/repo/worlds';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route(async (req, { params }: Ctx) => {
  const { id } = await params;
  if (!getLore(id)) throw notFound('ロア');
  const body = await readBody(req);
  const lore = updateLore(id, {
    title: body.title !== undefined ? reqString(body, 'title', 'タイトル', 200) : undefined,
    content: optString(body, 'content'),
  });
  return json({ lore });
});

export const DELETE = route(async (_req, { params }: Ctx) => {
  const { id } = await params;
  if (!getLore(id)) throw notFound('ロア');
  deleteLore(id);
  return json({ ok: true });
});
