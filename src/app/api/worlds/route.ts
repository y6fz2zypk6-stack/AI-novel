import { json, optString, readBody, reqString, route } from '@/lib/server/http';
import { createWorld, listWorlds } from '@/lib/server/repo/worlds';

export const GET = route(() => json({ worlds: listWorlds() }));

export const POST = route(async (req) => {
  const body = await readBody(req);
  const world = createWorld({
    name: reqString(body, 'name', '名前', 200),
    description: optString(body, 'description', 5000) ?? '',
    baseInstruction: optString(body, 'baseInstruction') ?? '',
  });
  return json({ world }, { status: 201 });
});
