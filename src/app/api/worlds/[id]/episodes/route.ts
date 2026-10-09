import { AppError, json, notFound, optString, readBody, route } from '@/lib/server/http';
import { createEpisode, getEpisode } from '@/lib/server/repo/episodes';
import { getWorld, touchWorld } from '@/lib/server/repo/worlds';
import type { EpisodeKind } from '@/lib/types';

type Ctx = { params: Promise<{ id: string }> };

/**
 * 新しい話を作る（本編の最新話の要約と人物・ロアの選択を引き継ぐ）。
 * { kind: 'side' } で番外編（本編とは別に番号を振る）。baseEpisodeId で土台にする本編の話を選べる。
 */
export const POST = route(async (req, { params }: Ctx) => {
  const { id } = await params;
  if (!getWorld(id)) throw notFound('World');
  const body = await readBody(req).catch(() => ({}) as Record<string, unknown>);
  const kind = body.kind ?? 'main';
  if (kind !== 'main' && kind !== 'side') throw new AppError(400, 'kind は main か side で指定してください');
  const baseEpisodeId = kind === 'side' ? optString(body, 'baseEpisodeId', 100) : undefined;
  if (baseEpisodeId) {
    const base = getEpisode(baseEpisodeId);
    if (!base || base.worldId !== id || base.kind !== 'main') throw notFound('土台にする本編の話');
  }
  const episode = createEpisode(id, kind as EpisodeKind, { baseEpisodeId });
  touchWorld(id);
  return json({ episode }, { status: 201 });
});
