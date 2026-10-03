import { AppError, json, readBody, route } from '@/lib/server/http';
import { defaultChoice } from '@/lib/server/models';
import { getProvider, getSettings, updateProvider, updateSettings } from '@/lib/server/repo/providers';
import type { AppSettings, ModelPurpose } from '@/lib/types';

function state() {
  return {
    settings: getSettings(),
    defaults: {
      writing: defaultChoice('writing'),
      summary: defaultChoice('summary'),
      image: defaultChoice('image'),
    },
  };
}

export const GET = route(() => json(state()));

const PURPOSE_KEY: Record<ModelPurpose, keyof AppSettings> = {
  writing: 'writingProviderId',
  summary: 'summaryProviderId',
  image: 'imageProviderId',
};

const MODEL_FIELD = {
  writing: 'defaultTextModel',
  summary: 'defaultSummaryModel',
  image: 'defaultImageModel',
} as const;

/**
 * 設定の更新。
 * - temperature / maxTokens
 * - defaultModel: { purpose, providerId, model } … 用途ごとの既定モデル（Provider の既定モデルとして保存）
 */
export const PATCH = route(async (req) => {
  const body = await readBody(req);
  const patch: Partial<AppSettings> = {};
  if (body.temperature !== undefined) {
    const t = Number(body.temperature);
    if (!Number.isFinite(t) || t < 0 || t > 2) throw new AppError(400, 'Temperature は 0〜2 で指定してください');
    patch.temperature = Math.round(t * 100) / 100;
  }
  if (body.maxTokens !== undefined) {
    if (body.maxTokens === null || body.maxTokens === '' || body.maxTokens === 0) patch.maxTokens = null;
    else {
      const n = Number(body.maxTokens);
      if (!Number.isInteger(n) || n < 1 || n > 1_000_000) {
        throw new AppError(400, 'Max Tokens は 1 以上の整数で指定してください（空欄で上限なし）');
      }
      patch.maxTokens = n;
    }
  }
  const dm = body.defaultModel as { purpose?: unknown; providerId?: unknown; model?: unknown } | undefined;
  if (dm !== undefined) {
    const purpose = dm?.purpose;
    if (purpose !== 'writing' && purpose !== 'summary' && purpose !== 'image') {
      throw new AppError(400, 'purpose は writing / summary / image のいずれかです');
    }
    const providerId = typeof dm.providerId === 'string' ? dm.providerId : '';
    const model = typeof dm.model === 'string' ? dm.model.trim() : '';
    if (!getProvider(providerId)) throw new AppError(400, 'Provider が見つかりません');
    if (!model || model.length > 300) throw new AppError(400, 'モデルIDを入力してください');
    updateProvider(providerId, { [MODEL_FIELD[purpose]]: model });
    (patch as Record<string, unknown>)[PURPOSE_KEY[purpose]] = providerId;
  }
  updateSettings(patch);
  return json(state());
});
