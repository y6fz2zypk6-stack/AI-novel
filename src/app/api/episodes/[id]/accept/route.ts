import { AppError, json, notFound, readBody, reqString, route } from '@/lib/server/http';
import { getEpisode, setAccepted } from '@/lib/server/repo/episodes';
import { getGeneration } from '@/lib/server/repo/generations';
import { touchWorld } from '@/lib/server/repo/worlds';

type Ctx = { params: Promise<{ id: string }> };

/**
 * 候補を採用する（機能仕様 §14）。後から別の候補へ変更できる。
 * 要約は自動では作らない（採用後の画面の「要約を生成」で作る）。
 */
export const POST = route(async (req, { params }: Ctx) => {
  const { id } = await params;
  const ep = getEpisode(id);
  if (!ep) throw notFound('エピソード');
  const body = await readBody(req);
  const gen = getGeneration(reqString(body, 'generationId', '候補', 100));
  if (!gen || gen.episodeId !== id) throw notFound('候補');
  if (gen.status === 'generating') throw new AppError(409, '生成中の候補は採用できません');
  if (!gen.content.trim()) throw new AppError(400, '本文が空の候補は採用できません');
  setAccepted(id, gen.id);
  touchWorld(ep.worldId);
  return json({ ok: true });
});
