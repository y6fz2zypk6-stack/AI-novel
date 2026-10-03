import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { appSettings, episodes, providerSettings, type ProviderRow } from '@/lib/db/schema';
import type { AppSettings, ProviderType, ProviderView } from '@/lib/types';
import { DEFAULT_SETTINGS, getDb } from '../db';
import { newId } from '../ids';
import type { ResolvedProvider } from '../llm/client';
import { decryptSecret, encryptSecret, maskKey } from '../secret';

/** API キーの実体。DB に無い OpenRouter は環境変数 OPENROUTER_API_KEY を使う */
function apiKeyOf(row: ProviderRow): { key: string | null; source: 'db' | 'env' | null } {
  if (row.encryptedApiKey) {
    const key = decryptSecret(row.encryptedApiKey);
    if (key) return { key, source: 'db' };
  }
  const env = process.env.OPENROUTER_API_KEY?.trim();
  if (row.providerType === 'openrouter' && env) return { key: env, source: 'env' };
  return { key: null, source: null };
}

export function toProviderView(row: ProviderRow): ProviderView {
  const { key, source } = apiKeyOf(row);
  return {
    id: row.id,
    name: row.name,
    type: row.providerType,
    baseUrl: row.baseUrl,
    maskedKey: key ? maskKey(key) : null,
    keySource: source,
    defaultTextModel: row.defaultTextModel,
    defaultSummaryModel: row.defaultSummaryModel,
    defaultImageModel: row.defaultImageModel,
  };
}

export function listProviders(): ProviderRow[] {
  return getDb().select().from(providerSettings).orderBy(asc(providerSettings.createdAt)).all();
}

export function getProvider(id: string): ProviderRow | undefined {
  return getDb().select().from(providerSettings).where(eq(providerSettings.id, id)).get();
}

/** サーバー内部でのみ使う（API キーを含む） */
export function resolveProvider(row: ProviderRow): ResolvedProvider {
  return {
    id: row.id,
    name: row.name,
    type: row.providerType,
    baseUrl: row.baseUrl,
    apiKey: apiKeyOf(row).key,
  };
}

export type ProviderInput = {
  name: string;
  type: ProviderType;
  baseUrl: string;
  /** undefined = 変更しない / '' = 削除 */
  apiKey?: string;
  defaultTextModel?: string;
  defaultSummaryModel?: string;
  defaultImageModel?: string;
};

export function createProvider(input: ProviderInput): ProviderRow {
  const now = Date.now();
  const row: ProviderRow = {
    id: newId(),
    name: input.name,
    providerType: input.type,
    baseUrl: input.baseUrl,
    encryptedApiKey: input.apiKey ? encryptSecret(input.apiKey) : null,
    defaultTextModel: input.defaultTextModel ?? '',
    defaultSummaryModel: input.defaultSummaryModel ?? '',
    defaultImageModel: input.defaultImageModel ?? '',
    createdAt: now,
    updatedAt: now,
  };
  getDb().insert(providerSettings).values(row).run();
  return row;
}

export function updateProvider(id: string, input: Partial<ProviderInput>): ProviderRow | undefined {
  const patch: Partial<ProviderRow> = { updatedAt: Date.now() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.type !== undefined) patch.providerType = input.type;
  if (input.baseUrl !== undefined) patch.baseUrl = input.baseUrl;
  if (input.apiKey !== undefined) patch.encryptedApiKey = input.apiKey ? encryptSecret(input.apiKey) : null;
  if (input.defaultTextModel !== undefined) patch.defaultTextModel = input.defaultTextModel;
  if (input.defaultSummaryModel !== undefined) patch.defaultSummaryModel = input.defaultSummaryModel;
  if (input.defaultImageModel !== undefined) patch.defaultImageModel = input.defaultImageModel;
  getDb().update(providerSettings).set(patch).where(eq(providerSettings.id, id)).run();
  return getProvider(id);
}

/** 既定モデルで使っている Provider は消せない。Episode の一時変更は既定に戻す */
export function deleteProvider(id: string): { ok: true } | { ok: false; reason: string } {
  const s = getSettings();
  if ([s.writingProviderId, s.summaryProviderId, s.imageProviderId].includes(id)) {
    return { ok: false, reason: '既定モデルで使用中の Provider は削除できません。先に既定モデルを変更してください。' };
  }
  const db = getDb();
  db.transaction((tx) => {
    tx.update(episodes)
      .set({ writingProviderId: null, writingModel: null })
      .where(eq(episodes.writingProviderId, id))
      .run();
    tx.delete(providerSettings).where(eq(providerSettings.id, id)).run();
  });
  return { ok: true };
}

// ---- アプリ設定 ----

export function getSettings(): AppSettings {
  const rows = getDb().select().from(appSettings).all();
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const str = (k: string) => (typeof map.get(k) === 'string' ? (map.get(k) as string) : null);
  const temperature = map.get('temperature');
  const maxTokens = map.get('maxTokens');
  return {
    writingProviderId: str('writingProviderId'),
    summaryProviderId: str('summaryProviderId'),
    imageProviderId: str('imageProviderId'),
    temperature: typeof temperature === 'number' ? temperature : DEFAULT_SETTINGS.temperature,
    // 0 は「送らない」（モデルの既定に任せる）
    maxTokens: typeof maxTokens === 'number' ? maxTokens || null : DEFAULT_SETTINGS.maxTokens,
  };
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const db = getDb();
  db.transaction((tx) => {
    for (const [key, raw] of Object.entries(patch)) {
      if (raw === undefined) continue;
      const value = key === 'maxTokens' && raw === null ? 0 : raw;
      if (value === null) continue;
      tx.insert(appSettings)
        .values({ key, value })
        .onConflictDoUpdate({ target: appSettings.key, set: { value } })
        .run();
    }
  });
  return getSettings();
}
