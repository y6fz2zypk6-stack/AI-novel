import { startGeneration } from '@/lib/server/generation';
import { json, optNullableString, readBody, route } from '@/lib/server/http';
import { getGeneration, toGenerationView } from '@/lib/server/repo/generations';

type Ctx = { params: Promise<{ id: string }> };

/** 本文生成を開始する。生成はサーバー側で続き、進み具合は GET /api/generations/:id で取得する */
export const POST = route(async (req, { params }: Ctx) => {
  const { id } = await params;
  const body = await readBody(req);
  const generationId = startGeneration(id, {
    revisionOf: optNullableString(body, 'revisionOf', 100),
    revisionNote: optNullableString(body, 'revisionNote', 20_000),
  });
  return json({ generationId, generation: toGenerationView(getGeneration(generationId)!) }, { status: 202 });
});
