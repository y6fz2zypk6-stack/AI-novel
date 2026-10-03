import { json, notFound, optNullableString, optString, readBody, route } from '@/lib/server/http';
import { taskState } from '@/lib/server/jobs';
import { getEpisode } from '@/lib/server/repo/episodes';
import { listEpisodeImages, toImageView } from '@/lib/server/repo/images';
import { startStill } from '@/lib/server/stills';

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req, { params }: Ctx) => {
  const { id } = await params;
  if (!getEpisode(id)) throw notFound('エピソード');
  return json({ images: listEpisodeImages(id).map(toImageView), job: taskState('image', id) });
});

export const POST = route(async (req, { params }: Ctx) => {
  const { id } = await params;
  const body = await readBody(req);
  startStill(id, {
    instruction: optString(body, 'instruction', 5000) ?? '',
    providerId: optNullableString(body, 'providerId', 100),
    model: optNullableString(body, 'model', 300),
  });
  return json({ ok: true, job: taskState('image', id) }, { status: 202 });
});
