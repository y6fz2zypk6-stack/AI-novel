import { json, route } from '@/lib/server/http';
import { startSummary } from '@/lib/server/summary';

type Ctx = { params: Promise<{ id: string }> };

export const POST = route(async (_req, { params }: Ctx) => {
  startSummary((await params).id);
  return json({ ok: true }, { status: 202 });
});
