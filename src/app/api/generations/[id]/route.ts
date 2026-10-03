import { pollGeneration } from '@/lib/server/generation';
import { json, route } from '@/lib/server/http';

type Ctx = { params: Promise<{ id: string }> };

/** 生成の進み具合。?from=N で N 文字目以降の差分だけを返す */
export const GET = route(async (req, { params }: Ctx) => {
  const { id } = await params;
  const from = Math.max(0, Number(new URL(req.url).searchParams.get('from')) || 0);
  return json(pollGeneration(id, from));
});
