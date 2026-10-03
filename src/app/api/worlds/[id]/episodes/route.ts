import { json, notFound, route } from '@/lib/server/http';
import { createEpisode } from '@/lib/server/repo/episodes';
import { getWorld, touchWorld } from '@/lib/server/repo/worlds';

type Ctx = { params: Promise<{ id: string }> };

/** 次のエピソードを作る（前話の要約と人物・ロアの選択を引き継ぐ） */
export const POST = route(async (_req, { params }: Ctx) => {
  const { id } = await params;
  if (!getWorld(id)) throw notFound('World');
  const episode = createEpisode(id);
  touchWorld(id);
  return json({ episode }, { status: 201 });
});
