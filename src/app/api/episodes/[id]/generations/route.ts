import { settleStaleGeneration } from '@/lib/server/generation';
import { json, notFound, route } from '@/lib/server/http';
import { getEpisode } from '@/lib/server/repo/episodes';
import { listGenerations, toGenerationView } from '@/lib/server/repo/generations';

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req, { params }: Ctx) => {
  const { id } = await params;
  if (!getEpisode(id)) throw notFound('エピソード');
  const generations = listGenerations(id).map((g) => toGenerationView(settleStaleGeneration(g)));
  return json({ generations });
});
