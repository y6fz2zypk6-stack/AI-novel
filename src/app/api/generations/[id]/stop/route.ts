import { stopGeneration } from '@/lib/server/generation';
import { json, route } from '@/lib/server/http';

type Ctx = { params: Promise<{ id: string }> };

export const POST = route(async (_req, { params }: Ctx) => json({ stopped: stopGeneration((await params).id) }));
