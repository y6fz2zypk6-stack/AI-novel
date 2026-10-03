import { generationJobs } from '@/lib/server/jobs';
import { json, notFound, optString, readBody, reqString, route } from '@/lib/server/http';
import { listEpisodes } from '@/lib/server/repo/episodes';
import { deleteImageFilesForEpisodes } from '@/lib/server/repo/images';
import { deleteWorld, getWorld, updateWorld } from '@/lib/server/repo/worlds';

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req, { params }: Ctx) => {
  const world = getWorld((await params).id);
  if (!world) throw notFound('World');
  return json({ world });
});

export const PATCH = route(async (req, { params }: Ctx) => {
  const { id } = await params;
  if (!getWorld(id)) throw notFound('World');
  const body = await readBody(req);
  const world = updateWorld(id, {
    name: body.name !== undefined ? reqString(body, 'name', '名前', 200) : undefined,
    description: optString(body, 'description', 5000),
    baseInstruction: optString(body, 'baseInstruction'),
  });
  return json({ world });
});

export const DELETE = route(async (_req, { params }: Ctx) => {
  const { id } = await params;
  if (!getWorld(id)) throw notFound('World');
  const episodeIds = listEpisodes(id).map((e) => e.id);
  for (const job of generationJobs.values()) if (episodeIds.includes(job.episodeId)) job.abort.abort();
  deleteImageFilesForEpisodes(episodeIds);
  deleteWorld(id);
  return json({ ok: true });
});
