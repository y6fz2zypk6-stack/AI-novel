import 'server-only';

// AI API のエラーを、画面に出せる日本語の理由に分類する（機能仕様 §35）

export type LLMErrorKind =
  | 'auth'
  | 'credits'
  | 'connection'
  | 'model'
  | 'rate'
  | 'timeout'
  | 'context'
  | 'moderation'
  | 'bad_request'
  | 'server'
  | 'empty'
  | 'aborted'
  | 'unknown';

const MESSAGES: Record<LLMErrorKind, string> = {
  auth: 'APIキーが無効です。Settings で API キーを確認してください。',
  credits: 'Provider のクレジットが不足しています。',
  connection: 'Provider に接続できませんでした。Base URL とネットワークを確認してください。',
  model: 'モデルが見つかりません。モデルIDを確認してください。',
  rate: 'レート制限に達しました。少し待ってから再試行してください。',
  timeout: 'API の応答がタイムアウトしました。',
  context:
    'コンテキスト長の上限を超えました。人物・ロア・要約を減らすか、より長いコンテキストのモデルを選んでください。',
  moderation: 'Provider のモデレーションにより拒否されました。',
  bad_request: 'Provider がリクエストを受け付けませんでした。',
  server: 'Provider 側でエラーが発生しました。少し待ってから再試行してください。',
  empty: 'モデルから本文が返りませんでした。',
  aborted: '停止しました。',
  unknown: '生成中にエラーが発生しました。',
};

export class LLMError extends Error {
  readonly kind: LLMErrorKind;
  readonly status?: number;
  readonly detail?: string;

  constructor(kind: LLMErrorKind, opts: { status?: number; detail?: string; message?: string } = {}) {
    super(opts.message ?? MESSAGES[kind]);
    this.name = 'LLMError';
    this.kind = kind;
    this.status = opts.status;
    this.detail = opts.detail;
  }
}

const CONTEXT_PATTERNS = [
  /context.{0,20}length/i,
  /context.{0,10}window/i,
  /maximum context/i,
  /too many tokens/i,
  /prompt is too long/i,
  /input is too long/i,
  /reduce the length/i,
];

const MODEL_PATTERNS = [
  /not a valid model/i,
  /model.{0,30}(not found|does not exist|not exist|unknown|invalid)/i,
  /no endpoints found/i,
  /unknown model/i,
  /invalid model/i,
];

/** レスポンス本文から上流のエラーメッセージを取り出す */
export function upstreamMessage(body: string): string {
  try {
    const json = JSON.parse(body) as {
      error?: { message?: string; metadata?: { raw?: string } } | string;
      message?: string;
    };
    if (typeof json.error === 'string') return json.error;
    const raw = json.error?.metadata?.raw;
    return [json.error?.message, raw && typeof raw === 'string' ? raw : null, json.message]
      .filter(Boolean)
      .join(' / ');
  } catch {
    return body;
  }
}

export function classifyHttpError(status: number, body: string): LLMError {
  const message = upstreamMessage(body).replace(/\s+/g, ' ').trim().slice(0, 300);
  const detail = `${status}${message ? ` ${message}` : ''}`;
  const has = (patterns: RegExp[]) => patterns.some((p) => p.test(message));
  if (has(CONTEXT_PATTERNS) || status === 413) return new LLMError('context', { status, detail });
  if (has(MODEL_PATTERNS)) return new LLMError('model', { status, detail });
  if (status === 401) return new LLMError('auth', { status, detail });
  if (status === 402) return new LLMError('credits', { status, detail });
  if (status === 403) {
    if (/moderat|flagged|safety|content policy/i.test(message)) {
      return new LLMError('moderation', { status, detail });
    }
    return new LLMError('auth', { status, detail });
  }
  if (status === 404) return new LLMError('model', { status, detail });
  if (status === 408 || status === 504 || status === 524) return new LLMError('timeout', { status, detail });
  if (status === 429) return new LLMError('rate', { status, detail });
  if (status >= 500) return new LLMError('server', { status, detail });
  return new LLMError('bad_request', { status, detail });
}

/** ストリームの途中で届いた error オブジェクト（OpenRouter など） */
export function classifyStreamError(err: { code?: number | string; message?: string }): LLMError {
  const code = typeof err.code === 'number' ? err.code : Number(err.code) || 500;
  return classifyHttpError(code, JSON.stringify({ error: { message: err.message ?? '' } }));
}

/** fetch 自体が失敗した（DNS・接続拒否・TLS など） */
export function connectionError(err: unknown): LLMError {
  const e = err as { message?: string; cause?: { code?: string; message?: string } };
  const detail = [e?.cause?.code, e?.cause?.message ?? e?.message].filter(Boolean).join(' ');
  return new LLMError('connection', { detail: detail.slice(0, 200) });
}

/** 画面に出す文言（理由 + 上流の詳細） */
export function describeError(err: unknown): string {
  if (err instanceof LLMError) {
    return err.detail ? `${err.message}（${err.detail}）` : err.message;
  }
  if (err instanceof Error) {
    if (/SQLITE|database/i.test(err.message)) return `データベースへの保存に失敗しました（${err.message}）`;
    return err.message;
  }
  return String(err);
}
