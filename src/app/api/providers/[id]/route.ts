import { AppError, json, notFound, optString, readBody, reqString, route } from '@/lib/server/http';
import { clearModelCache } from '@/lib/server/model-cache';
import { parseBaseUrl, parseProviderType } from '@/lib/server/provider-input';
import { deleteProvider, getProvider, toProviderView, updateProvider } from '@/lib/server/repo/providers';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route(async (req, { params }: Ctx) => {
  const { id } = await params;
  if (!getProvider(id)) throw notFound('Provider');
  const body = await readBody(req);
  const row = updateProvider(id, {
    name: body.name !== undefined ? reqString(body, 'name', '名前', 100) : undefined,
    type: body.type !== undefined ? parseProviderType(body.type) : undefined,
    baseUrl: body.baseUrl !== undefined ? parseBaseUrl(reqString(body, 'baseUrl', 'Base URL', 500)) : undefined,
    // undefined = 変更しない / '' = キーを削除
    apiKey: optString(body, 'apiKey', 500)?.trim(),
    defaultTextModel: optString(body, 'defaultTextModel', 300)?.trim(),
    defaultSummaryModel: optString(body, 'defaultSummaryModel', 300)?.trim(),
    defaultImageModel: optString(body, 'defaultImageModel', 300)?.trim(),
  });
  clearModelCache(id);
  return json({ provider: toProviderView(row!) });
});

export const DELETE = route(async (_req, { params }: Ctx) => {
  const { id } = await params;
  if (!getProvider(id)) throw notFound('Provider');
  const result = deleteProvider(id);
  if (!result.ok) throw new AppError(409, result.reason);
  clearModelCache(id);
  return json({ ok: true });
});
