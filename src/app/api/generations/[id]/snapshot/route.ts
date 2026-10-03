import { json, notFound, route } from '@/lib/server/http';
import { getGeneration } from '@/lib/server/repo/generations';

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req, { params }: Ctx) => {
  const gen = getGeneration((await params).id);
  if (!gen) throw notFound('候補');
  return json({
    snapshot: gen.promptSnapshot,
    usage: gen.usage ?? null,
    createdAt: gen.createdAt,
  });
});
