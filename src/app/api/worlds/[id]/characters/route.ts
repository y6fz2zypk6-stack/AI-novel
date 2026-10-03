import { json, notFound, optString, readBody, reqString, route } from '@/lib/server/http';
import { createCharacter, getWorld } from '@/lib/server/repo/worlds';

type Ctx = { params: Promise<{ id: string }> };

export const POST = route(async (req, { params }: Ctx) => {
  const { id } = await params;
  if (!getWorld(id)) throw notFound('World');
  const body = await readBody(req);
  const character = createCharacter(id, {
    name: reqString(body, 'name', '名前', 200),
    content: optString(body, 'content') ?? '',
  });
  return json({ character }, { status: 201 });
});
