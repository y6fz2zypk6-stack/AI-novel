import 'server-only';
import type { ProviderRow } from '@/lib/db/schema';
import type { ModelChoice, ModelPurpose } from '@/lib/types';
import { AppError } from './http';
import type { ResolvedProvider } from './llm/client';
import { getProvider, getSettings, listProviders, resolveProvider } from './repo/providers';

const PURPOSE_LABEL: Record<ModelPurpose, string> = { writing: '執筆', summary: '要約', image: '画像' };

function providerIdFor(purpose: ModelPurpose): string | null {
  const s = getSettings();
  return purpose === 'writing' ? s.writingProviderId : purpose === 'summary' ? s.summaryProviderId : s.imageProviderId;
}

function modelOf(row: ProviderRow, purpose: ModelPurpose): string {
  if (purpose === 'writing') return row.defaultTextModel;
  if (purpose === 'summary') return row.defaultSummaryModel || row.defaultTextModel;
  return row.defaultImageModel;
}

/** 用途ごとの既定モデル（未設定なら null） */
export function defaultChoice(purpose: ModelPurpose): ModelChoice | null {
  const id = providerIdFor(purpose);
  const row = (id && getProvider(id)) || listProviders()[0];
  if (!row) return null;
  return { providerId: row.id, providerName: row.name, model: modelOf(row, purpose) };
}

/**
 * 実際に使う Provider とモデルを決める。
 * override（Episode ごとの一時変更や、画像シートでの選択）があればそれを優先する。
 */
export function resolveModel(
  purpose: ModelPurpose,
  override?: { providerId?: string | null; model?: string | null } | null,
): { provider: ResolvedProvider; model: string } {
  let row: ProviderRow | undefined;
  let model = '';
  if (override?.providerId && override.model) {
    row = getProvider(override.providerId);
    model = override.model;
  }
  if (!row) {
    const choice = defaultChoice(purpose);
    row = choice ? getProvider(choice.providerId) : undefined;
    model = choice?.model ?? '';
  }
  if (!row) throw new AppError(400, 'Provider が登録されていません。Settings で追加してください。');
  if (!model.trim()) {
    throw new AppError(400, `既定の${PURPOSE_LABEL[purpose]}モデルが設定されていません。Settings で選んでください。`);
  }
  const provider = resolveProvider(row);
  if (provider.type === 'openrouter' && !provider.apiKey) {
    throw new AppError(
      400,
      `${provider.name} の API キーが設定されていません。Settings の Provider から設定してください。`,
    );
  }
  return { provider, model: model.trim() };
}
