import 'server-only';
import type { ChatMessage, ModelInfo, ProviderType, Usage } from '@/lib/types';
import {
  LLMError,
  classifyHttpError,
  classifyStreamError,
  connectionError,
  upstreamMessage,
} from './errors';

// OpenRouter / OpenAI 互換 API の呼び出し（機能仕様 §19）。
// どちらも /chat/completions（SSE）で本文を生成する。違いはヘッダと画像生成の経路だけ。

export type ResolvedProvider = {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl: string;
  apiKey: string | null;
};

export type GenerateTextRequest = {
  model: string;
  messages: ChatMessage[];
  temperature?: number | null;
  maxTokens?: number | null;
  signal?: AbortSignal;
  /** 本文が届くたびに呼ばれる */
  onDelta?: (text: string) => void;
  /** 推論（reasoning）が届いたときに呼ばれる */
  onReasoning?: () => void;
};

export type GenerateTextResult = {
  text: string;
  finishReason: string | null;
  usage: Usage | null;
};

export interface LLMProvider {
  generateText(request: GenerateTextRequest): Promise<GenerateTextResult>;
}

export type GenerateImageRequest = {
  model: string;
  prompt: string;
  /** 例: '3:4' */
  aspectRatio: string;
  signal?: AbortSignal;
};

export type GenerateImageResult = {
  data: Buffer;
  mime: string;
};

export interface ImageProvider {
  generateImage(request: GenerateImageRequest): Promise<GenerateImageResult>;
}

const CONNECT_TIMEOUT_MS = Number(process.env.LLM_CONNECT_TIMEOUT_MS) || 90_000;
const IDLE_TIMEOUT_MS = Number(process.env.LLM_IDLE_TIMEOUT_MS) || 120_000;
const IMAGE_TIMEOUT_MS = Number(process.env.IMAGE_TIMEOUT_MS) || 180_000;
const LIST_TIMEOUT_MS = 20_000;

function headersOf(p: ResolvedProvider): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (p.apiKey) h.Authorization = `Bearer ${p.apiKey}`;
  if (p.type === 'openrouter') {
    h['HTTP-Referer'] = process.env.APP_URL || 'http://localhost';
    h['X-Title'] = 'Novel Studio';
  }
  return h;
}

function endpoint(p: ResolvedProvider, path: string): string {
  return `${p.baseUrl.replace(/\/+$/, '')}${path}`;
}

/**
 * 呼び出し元の停止（signal）とタイムアウトをまとめて扱う AbortController。
 * 中断の理由（停止 / タイムアウト）を区別できるようにする。
 */
function controller(signal?: AbortSignal) {
  const ctl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let timedOut = false;
  const relay = () => ctl.abort();
  if (signal?.aborted) ctl.abort();
  else signal?.addEventListener('abort', relay, { once: true });
  return {
    signal: ctl.signal,
    arm(ms: number) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timedOut = true;
        ctl.abort();
      }, ms);
    },
    dispose() {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener('abort', relay);
    },
    /** 中断による例外を LLMError に変換する。中断でなければ null */
    abortError(): LLMError | null {
      if (timedOut) return new LLMError('timeout');
      if (signal?.aborted) return new LLMError('aborted');
      return null;
    },
  };
}

function toUsage(u: unknown): Usage | null {
  if (!u || typeof u !== 'object') return null;
  const x = u as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  const usage: Usage = {
    promptTokens: num(x.prompt_tokens),
    completionTokens: num(x.completion_tokens),
    totalTokens: num(x.total_tokens),
    cost: num(x.cost),
  };
  return Object.values(usage).some((v) => v !== undefined) ? usage : null;
}

/**
 * 400 エラーの内容から、送るパラメータを調整して再送できるか判断する。
 * （OpenAI の推論モデルは max_tokens / temperature を受け付けない、など）
 */
function adaptBody(body: Record<string, unknown>, errorText: string): Record<string, unknown> | null {
  const msg = upstreamMessage(errorText);
  if (/max_completion_tokens/i.test(msg) && 'max_tokens' in body) {
    const { max_tokens, ...rest } = body;
    return { ...rest, max_completion_tokens: max_tokens };
  }
  if (/temperature/i.test(msg) && /unsupported|not support|only the default/i.test(msg) && 'temperature' in body) {
    const { temperature: _t, ...rest } = body;
    void _t;
    return rest;
  }
  if (/stream_options/i.test(msg) && 'stream_options' in body) {
    const { stream_options: _s, ...rest } = body;
    void _s;
    return rest;
  }
  return null;
}

async function generateText(p: ResolvedProvider, req: GenerateTextRequest): Promise<GenerateTextResult> {
  let body: Record<string, unknown> = {
    model: req.model,
    messages: req.messages,
    stream: true,
    stream_options: { include_usage: true },
  };
  if (req.temperature != null) body.temperature = req.temperature;
  if (req.maxTokens) body.max_tokens = req.maxTokens;
  if (p.type === 'openrouter') body.usage = { include: true };

  const c = controller(req.signal);
  try {
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      c.arm(CONNECT_TIMEOUT_MS);
      try {
        res = await fetch(endpoint(p, '/chat/completions'), {
          method: 'POST',
          headers: headersOf(p),
          body: JSON.stringify(body),
          signal: c.signal,
        });
      } catch (err) {
        throw c.abortError() ?? connectionError(err);
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const adapted = res.status === 400 && attempt < 3 ? adaptBody(body, text) : null;
        if (adapted) {
          body = adapted;
          continue;
        }
        throw classifyHttpError(res.status, text);
      }
      try {
        return await readCompletion(res, req, () => c.arm(IDLE_TIMEOUT_MS));
      } catch (err) {
        if (err instanceof LLMError) throw err;
        throw c.abortError() ?? connectionError(err);
      }
    }
  } finally {
    c.dispose();
  }
}

type CompletionChunk = {
  error?: { code?: number | string; message?: string };
  choices?: {
    delta?: { content?: unknown; reasoning?: unknown; reasoning_content?: unknown };
    message?: { content?: unknown };
    finish_reason?: string | null;
  }[];
  usage?: unknown;
};

/** SSE（または stream を無視して JSON で返す実装）を読み、本文を組み立てる */
async function readCompletion(
  res: Response,
  req: GenerateTextRequest,
  touch: () => void,
): Promise<GenerateTextResult> {
  let text = '';
  let finishReason: string | null = null;
  let usage: Usage | null = null;

  const handle = (json: CompletionChunk) => {
    if (json.error) throw classifyStreamError(json.error);
    const choice = json.choices?.[0];
    const piece = choice?.delta?.content ?? choice?.message?.content;
    if (typeof piece === 'string' && piece) {
      text += piece;
      req.onDelta?.(piece);
    }
    if (choice?.delta?.reasoning || choice?.delta?.reasoning_content) req.onReasoning?.();
    if (choice?.finish_reason) finishReason = choice.finish_reason;
    if (json.usage) usage = toUsage(json.usage) ?? usage;
  };

  if ((res.headers.get('content-type') ?? '').includes('application/json')) {
    handle((await res.json()) as CompletionChunk);
    return { text, finishReason, usage };
  }
  if (!res.body) throw new LLMError('empty');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  touch();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    touch();
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).replace(/\r$/, '');
      buf = buf.slice(nl + 1);
      if (!line.startsWith('data:')) continue; // コメント行（: OPENROUTER PROCESSING など）
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      let json: CompletionChunk;
      try {
        json = JSON.parse(data) as CompletionChunk;
      } catch {
        continue;
      }
      handle(json);
    }
  }
  return { text, finishReason, usage };
}

// ---- 画像生成（機能仕様 §21） ----

function sniffMime(buf: Buffer): string {
  if (buf.length > 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  if (buf.length > 3 && buf.toString('ascii', 0, 3) === 'GIF') return 'image/gif';
  return 'image/png';
}

async function imageFromUrl(url: string, signal: AbortSignal): Promise<GenerateImageResult> {
  const dataUrl = url.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (dataUrl) {
    const data = dataUrl[2]
      ? Buffer.from(dataUrl[3], 'base64')
      : Buffer.from(decodeURIComponent(dataUrl[3]), 'utf8');
    return { data, mime: dataUrl[1] || sniffMime(data) };
  }
  const res = await fetch(url, { signal });
  if (!res.ok) throw new LLMError('server', { detail: `画像の取得に失敗しました（${res.status}）` });
  const data = Buffer.from(await res.arrayBuffer());
  return { data, mime: res.headers.get('content-type')?.split(';')[0] || sniffMime(data) };
}

type ImagesResponse = {
  data?: { b64_json?: string; url?: string; media_type?: string; mime_type?: string }[];
};

async function parseImagesResponse(json: ImagesResponse, signal: AbortSignal): Promise<GenerateImageResult> {
  const first = json.data?.[0];
  if (first?.b64_json) {
    const data = Buffer.from(first.b64_json, 'base64');
    return { data, mime: first.media_type || first.mime_type || sniffMime(data) };
  }
  if (first?.url) return imageFromUrl(first.url, signal);
  throw new LLMError('empty', {
    message: '画像が返りませんでした。画像生成に対応したモデルか確認してください。',
  });
}

async function postJson(
  p: ResolvedProvider,
  path: string,
  body: Record<string, unknown>,
  signal: AbortSignal,
): Promise<Response> {
  try {
    return await fetch(endpoint(p, path), {
      method: 'POST',
      headers: headersOf(p),
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    throw connectionError(err);
  }
}

/** OpenRouter: 画像専用の /images。無い環境では /chat/completions + modalities に切り替える */
async function generateImageOpenRouter(p: ResolvedProvider, req: GenerateImageRequest, signal: AbortSignal) {
  const res = await postJson(p, '/images', { model: req.model, prompt: req.prompt, aspect_ratio: req.aspectRatio }, signal);
  if (res.ok) return parseImagesResponse((await res.json()) as ImagesResponse, signal);
  const text = await res.text().catch(() => '');
  if (res.status !== 404 && res.status !== 405) throw classifyHttpError(res.status, text);

  const chat = await postJson(
    p,
    '/chat/completions',
    {
      model: req.model,
      messages: [{ role: 'user', content: req.prompt }],
      modalities: ['image', 'text'],
      image_config: { aspect_ratio: req.aspectRatio },
    },
    signal,
  );
  if (!chat.ok) throw classifyHttpError(chat.status, await chat.text().catch(() => ''));
  const json = (await chat.json()) as {
    choices?: { message?: { images?: { image_url?: { url?: string } }[] } }[];
  };
  const url = json.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url) {
    throw new LLMError('empty', {
      message: '画像が返りませんでした。画像生成に対応したモデルか確認してください。',
    });
  }
  return imageFromUrl(url, signal);
}

/** OpenAI 互換: /images/generations */
async function generateImageOpenAI(p: ResolvedProvider, req: GenerateImageRequest, signal: AbortSignal) {
  const size = req.aspectRatio === '3:4' ? '1024x1536' : '1024x1024';
  let body: Record<string, unknown> = { model: req.model, prompt: req.prompt, n: 1, size };
  for (let attempt = 0; ; attempt++) {
    const res = await postJson(p, '/images/generations', body, signal);
    if (res.ok) return parseImagesResponse((await res.json()) as ImagesResponse, signal);
    const text = await res.text().catch(() => '');
    // 縦長サイズに対応していないモデルでは size を外して再送する
    if (res.status === 400 && attempt === 0 && /size/i.test(upstreamMessage(text))) {
      const { size: _s, ...rest } = body;
      void _s;
      body = rest;
      continue;
    }
    throw classifyHttpError(res.status, text);
  }
}

async function generateImage(p: ResolvedProvider, req: GenerateImageRequest): Promise<GenerateImageResult> {
  const c = controller(req.signal);
  c.arm(IMAGE_TIMEOUT_MS);
  try {
    const result =
      p.type === 'openrouter'
        ? await generateImageOpenRouter(p, req, c.signal)
        : await generateImageOpenAI(p, req, c.signal);
    if (result.data.length === 0) throw new LLMError('empty', { message: '画像が空でした。' });
    return result;
  } catch (err) {
    const aborted = c.abortError();
    if (aborted) throw aborted;
    throw err;
  } finally {
    c.dispose();
  }
}

export function textProvider(p: ResolvedProvider): LLMProvider {
  return { generateText: (req) => generateText(p, req) };
}

export function imageProvider(p: ResolvedProvider): ImageProvider {
  return { generateImage: (req) => generateImage(p, req) };
}

// ---- モデル一覧・接続テスト ----

async function getJson(p: ResolvedProvider, path: string): Promise<unknown> {
  const c = controller();
  c.arm(LIST_TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await fetch(endpoint(p, path), { headers: headersOf(p), signal: c.signal });
    } catch (err) {
      throw c.abortError() ?? connectionError(err);
    }
    if (!res.ok) throw classifyHttpError(res.status, await res.text().catch(() => ''));
    return await res.json();
  } finally {
    c.dispose();
  }
}

type RawModel = {
  id?: string;
  name?: string;
  context_length?: number;
  architecture?: { output_modalities?: string[] };
};

function toModels(json: unknown, filter?: (m: RawModel) => boolean): ModelInfo[] {
  const list = ((json as { data?: RawModel[] })?.data ?? []).filter((m) => typeof m.id === 'string');
  return list
    .filter((m) => (filter ? filter(m) : true))
    .map((m) => ({ id: m.id as string, name: m.name || (m.id as string), contextLength: m.context_length ?? null }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export async function listModels(p: ResolvedProvider, kind: 'text' | 'image'): Promise<ModelInfo[]> {
  if (kind === 'image' && p.type === 'openrouter') {
    try {
      const models = toModels(await getJson(p, '/images/models'));
      if (models.length > 0) return models;
    } catch {
      // /images/models が無い場合は /models の出力モダリティで絞り込む
    }
    return toModels(await getJson(p, '/models'), (m) =>
      (m.architecture?.output_modalities ?? []).includes('image'),
    );
  }
  if (p.type === 'openrouter') {
    return toModels(await getJson(p, '/models'), (m) => {
      const out = m.architecture?.output_modalities;
      return !out || out.includes('text');
    });
  }
  return toModels(await getJson(p, '/models'));
}

/** キーの有効性を確かめる。OpenRouter の /models はキー無しでも返るため /key を使う */
export async function testConnection(p: ResolvedProvider): Promise<string> {
  if (p.type === 'openrouter') {
    if (!p.apiKey) throw new LLMError('auth', { message: 'API キーが設定されていません。' });
    try {
      const json = (await getJson(p, '/key')) as { data?: { label?: string } };
      return json.data?.label ? `接続できました（キー: ${json.data.label}）` : '接続できました';
    } catch (err) {
      if (!(err instanceof LLMError) || err.status !== 404) throw err;
    }
  }
  const models = toModels(await getJson(p, '/models'));
  return `接続できました（モデル ${models.length} 件）`;
}
