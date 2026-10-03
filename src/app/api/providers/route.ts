import { json, optString, readBody, reqString, route } from '@/lib/server/http';
import { parseBaseUrl, parseProviderType } from '@/lib/server/provider-input';
import { createProvider, listProviders, toProviderView } from '@/lib/server/repo/providers';

export const GET = route(() => json({ providers: listProviders().map(toProviderView) }));

export const POST = route(async (req) => {
  const body = await readBody(req);
  const row = createProvider({
    name: reqString(body, 'name', '名前', 100),
    type: parseProviderType(body.type),
    baseUrl: parseBaseUrl(reqString(body, 'baseUrl', 'Base URL', 500)),
    apiKey: optString(body, 'apiKey', 500)?.trim(),
    defaultTextModel: optString(body, 'defaultTextModel', 300)?.trim(),
    defaultSummaryModel: optString(body, 'defaultSummaryModel', 300)?.trim(),
    defaultImageModel: optString(body, 'defaultImageModel', 300)?.trim(),
  });
  return json({ provider: toProviderView(row) }, { status: 201 });
});
