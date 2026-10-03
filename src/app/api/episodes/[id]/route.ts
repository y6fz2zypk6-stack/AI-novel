import { runningGenerationFor } from '@/lib/server/jobs';
import {
  AppError,
  json,
  notFound,
  optNullableString,
  optString,
  optStringArray,
  readBody,
  route,
} from '@/lib/server/http';
import { deleteEpisode, getEpisode, updateEpisodeDraft } from '@/lib/server/repo/episodes';
import { deleteImageFilesForEpisodes } from '@/lib/server/repo/images';
import { getProvider } from '@/lib/server/repo/providers';

type Ctx = { params: Promise<{ id: string }> };

/** 生成前の入力（下書き）を保存する。数秒ごとに自動保存で呼ばれる */
export const PATCH = route(async (req, { params }: Ctx) => {
  const { id } = await params;
  if (!getEpisode(id)) throw notFound('エピソード');
  const body = await readBody(req);
  const writingProviderId = optNullableString(body, 'writingProviderId');
  const writingModel = optNullableString(body, 'writingModel');
  if (writingProviderId && !getProvider(writingProviderId)) throw new AppError(400, 'Provider が見つかりません');
  const episode = updateEpisodeDraft(id, {
    title: optString(body, 'title', 200),
    instruction: optString(body, 'instruction'),
    previousSummary: optString(body, 'previousSummary'),
    characterIds: optStringArray(body, 'characterIds'),
    loreIds: optStringArray(body, 'loreIds'),
    writingProviderId,
    writingModel: writingModel === undefined ? undefined : writingModel?.trim() || null,
  });
  return json({ episode });
});

export const DELETE = route(async (_req, { params }: Ctx) => {
  const { id } = await params;
  if (!getEpisode(id)) throw notFound('エピソード');
  runningGenerationFor(id)?.abort.abort();
  deleteImageFilesForEpisodes([id]);
  deleteEpisode(id);
  return json({ ok: true });
});
