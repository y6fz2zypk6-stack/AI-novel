import { AppError, json, notFound, route } from '@/lib/server/http';
import { cachedModels } from '@/lib/server/model-cache';
import { getProvider, resolveProvider } from '@/lib/server/repo/providers';

/** GET /api/models?providerId=...&kind=text|image */
export const GET = route(async (req) => {
  const params = new URL(req.url).searchParams;
  const row = getProvider(params.get('providerId') ?? '');
  if (!row) throw notFound('Provider');
  const kind = params.get('kind') === 'image' ? 'image' : 'text';
  try {
    return json({ models: await cachedModels(resolveProvider(row), kind) });
  } catch (err) {
    throw new AppError(502, `モデル一覧を取得できませんでした。${err instanceof Error ? err.message : ''}`);
  }
});
