import { pollGeneration } from '@/lib/server/generation';
import { AppError, json, notFound, optString, readBody, route } from '@/lib/server/http';
import { getEpisode } from '@/lib/server/repo/episodes';
import {
  editGenerationContent,
  getGeneration,
  revertGenerationContent,
  toGenerationView,
} from '@/lib/server/repo/generations';
import { touchWorld } from '@/lib/server/repo/worlds';

type Ctx = { params: Promise<{ id: string }> };

/** 生成の進み具合。?from=N で N 文字目以降の差分だけを返す */
export const GET = route(async (req, { params }: Ctx) => {
  const { id } = await params;
  const from = Math.max(0, Number(new URL(req.url).searchParams.get('from')) || 0);
  return json(pollGeneration(id, from));
});

/**
 * 本文を手で直す（{ content }）。{ revert: true } で AI の原文に戻す。
 * 直した本文は、このあとの要約・スチル・修正指示に使われる。
 */
export const PATCH = route(async (req, { params }: Ctx) => {
  const { id } = await params;
  const gen = getGeneration(id);
  if (!gen) throw notFound('候補');
  if (gen.status === 'generating') throw new AppError(409, '生成中の候補は直せません。生成が終わってからお試しください。');
  const body = await readBody(req);
  let row;
  if (body.revert === true) {
    row = revertGenerationContent(id);
  } else {
    const content = optString(body, 'content');
    if (!content?.trim()) throw new AppError(400, '本文を入力してください');
    row = editGenerationContent(id, content);
  }
  if (!row) throw notFound('候補');
  const ep = getEpisode(row.episodeId);
  if (ep) touchWorld(ep.worldId);
  return json({ generation: toGenerationView(row) });
});
