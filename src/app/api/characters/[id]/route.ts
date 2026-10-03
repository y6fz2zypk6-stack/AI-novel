import { json, notFound, optString, readBody, reqString, route } from '@/lib/server/http';
import { deleteCharacter, getCharacter, updateCharacter } from '@/lib/server/repo/worlds';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route(async (req, { params }: Ctx) => {
  const { id } = await params;
  if (!getCharacter(id)) throw notFound('人物');
  const body = await readBody(req);
  const character = updateCharacter(id, {
    name: body.name !== undefined ? reqString(body, 'name', '名前', 200) : undefined,
    content: optString(body, 'content'),
  });
  return json({ character });
});

export const DELETE = route(async (_req, { params }: Ctx) => {
  const { id } = await params;
  if (!getCharacter(id)) throw notFound('人物');
  deleteCharacter(id);
  return json({ ok: true });
});
