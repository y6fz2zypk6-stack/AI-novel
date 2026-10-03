import { AppError, json, notFound, readBody, reqString, route } from '@/lib/server/http';
import { getTask } from '@/lib/server/jobs';
import { describeError } from '@/lib/server/llm/errors';
import { getEpisode, setAccepted } from '@/lib/server/repo/episodes';
import { getGeneration } from '@/lib/server/repo/generations';
import { touchWorld } from '@/lib/server/repo/worlds';
import { startSummary } from '@/lib/server/summary';

type Ctx = { params: Promise<{ id: string }> };

/**
 * 候補を採用する（機能仕様 §14）。後から別の候補へ変更できる。
 * まだ要約が無ければ、続けて要約の生成を始める。
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

  let summaryStarted = false;
  let summaryError: string | null = null;
  const hasSummary = ep.summary.trim() || ep.summaryDraft?.trim();
  if (!hasSummary && getTask('summary', id)?.status !== 'running') {
    try {
      startSummary(id);
      summaryStarted = true;
    } catch (err) {
      summaryError = err instanceof AppError ? err.message : describeError(err);
    }
  }
  return json({ ok: true, summaryStarted, summaryError });
});
