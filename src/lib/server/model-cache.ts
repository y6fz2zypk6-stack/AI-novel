import 'server-only';
import type { ModelInfo } from '@/lib/types';
import { listModels, type ResolvedProvider } from './llm/client';

// モデル一覧は数百件あり毎回取りに行くと遅いので、10分だけ覚えておく
const TTL_MS = 10 * 60 * 1000;
const g = globalThis as unknown as { __novelModelCache?: Map<string, { at: number; models: ModelInfo[] }> };
const cache = (g.__novelModelCache ??= new Map());

export async function cachedModels(p: ResolvedProvider, kind: 'text' | 'image'): Promise<ModelInfo[]> {
  const key = `${p.id}:${kind}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.models;
  const models = await listModels(p, kind);
  cache.set(key, { at: Date.now(), models });
  return models;
}

export function clearModelCache(providerId: string): void {
  for (const key of cache.keys()) if (key.startsWith(`${providerId}:`)) cache.delete(key);
}
