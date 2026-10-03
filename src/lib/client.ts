// ブラウザ側の小さなヘルパー

/** パスで併存させる場合の接頭辞（next.config の basePath と同じ値） */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export function withBase(path: string): string {
  return `${BASE_PATH}${path}`;
}

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** API を呼ぶ。失敗したらサーバーの { error } を message に持つ ApiError を投げる */
export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown; keepalive?: boolean } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(withBase(path), {
      method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
      headers: init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      keepalive: init.keepalive,
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, 'サーバーに接続できませんでした。通信状況を確認してください。');
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // JSON 以外（プロキシのエラーページなど）
  }
  if (!res.ok) {
    const message =
      (data as { error?: string } | null)?.error ?? `エラーが発生しました（${res.status}）`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * 日時の表示はタイムゾーンを固定する（既定は日本時間）。
 * サーバー（Docker は UTC のことが多い）とブラウザで表示がずれないようにするため。
 */
const TIME_ZONE = process.env.NEXT_PUBLIC_TZ || 'Asia/Tokyo';

const partsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function parts(ms: number) {
  const p: Record<string, string> = {};
  for (const { type, value } of partsFmt.formatToParts(new Date(ms))) p[type] = value;
  return { y: p.year, m: p.month, d: p.day, time: `${p.hour}:${p.minute}` };
}

/** 18:12（今日）/ 10/3 18:12（今年）/ 2025/10/3 */
export function formatTime(ms: number, now = Date.now()): string {
  const t = parts(ms);
  const n = parts(now);
  if (t.y === n.y && t.m === n.m && t.d === n.d) return t.time;
  if (t.y === n.y) return `${t.m}/${t.d} ${t.time}`;
  return `${t.y}/${t.m}/${t.d}`;
}

export function formatDate(ms: number, now = Date.now()): string {
  const t = parts(ms);
  return t.y === parts(now).y ? `${t.m}/${t.d}` : `${t.y}/${t.m}/${t.d}`;
}

export function formatNumber(n: number): string {
  return n.toLocaleString('ja-JP');
}

/** モデルIDの表示用の短い名前（provider/ を外す） */
export function shortModel(model: string): string {
  const i = model.lastIndexOf('/');
  return i >= 0 ? model.slice(i + 1) : model;
}
