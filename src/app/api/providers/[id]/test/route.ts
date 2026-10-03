import { json, notFound, route } from '@/lib/server/http';
import { testConnection } from '@/lib/server/llm/client';
import { describeError } from '@/lib/server/llm/errors';
import { getProvider, resolveProvider } from '@/lib/server/repo/providers';

type Ctx = { params: Promise<{ id: string }> };

export const POST = route(async (_req, { params }: Ctx) => {
  const row = getProvider((await params).id);
  if (!row) throw notFound('Provider');
  try {
    return json({ ok: true, message: await testConnection(resolveProvider(row)) });
  } catch (err) {
    return json({ ok: false, message: describeError(err) });
  }
});
