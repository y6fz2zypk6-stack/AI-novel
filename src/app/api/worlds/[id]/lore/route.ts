import { json, notFound, optString, readBody, reqString, route } from '@/lib/server/http';
import { createLore, getWorld } from '@/lib/server/repo/worlds';

type Ctx = { params: Promise<{ id: string }> };

export const POST = route(async (req, { params }: Ctx) => {
  const { id } = await params;
  if (!getWorld(id)) throw notFound('World');
  const body = await readBody(req);
  const lore = createLore(id, {
    title: reqString(body, 'title', 'タイトル', 200),
    content: optString(body, 'content') ?? '',
  });
  return json({ lore }, { status: 201 });
});
