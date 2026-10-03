import 'server-only';
import type { ProviderType } from '@/lib/types';
import { AppError } from './http';

export function parseProviderType(v: unknown): ProviderType {
  if (v === 'openrouter' || v === 'openai-compatible') return v;
  throw new AppError(400, '種類は openrouter か openai-compatible を指定してください');
}

export function parseBaseUrl(v: string): string {
  let url: URL;
  try {
    url = new URL(v.trim());
  } catch {
    throw new AppError(400, 'Base URL の形式が正しくありません（例: https://openrouter.ai/api/v1）');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new AppError(400, 'Base URL は http:// または https:// で始めてください');
  }
  return url.toString().replace(/\/+$/, '');
}
