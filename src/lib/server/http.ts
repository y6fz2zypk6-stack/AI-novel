import 'server-only';
import { NextResponse } from 'next/server';
import { LLMError, describeError } from './llm/errors';

/** 画面にそのまま出せる理由つきのエラー */
export class AppError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const notFound = (what = 'データ') => new AppError(404, `${what}が見つかりません`);

export function json<T>(data: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(data, init);
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response> | Response;

/** ルートハンドラの共通処理。例外を { error } の JSON にする */
export function route<C>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof AppError) return json({ error: err.message }, { status: err.status });
      if (err instanceof LLMError) return json({ error: describeError(err) }, { status: 502 });
      console.error('[api]', req.method, new URL(req.url).pathname, err);
      return json({ error: describeError(err) }, { status: 500 });
    }
  };
}

export async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = (await req.json()) as unknown;
    if (body && typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // 下で 400 にする
  }
  throw new AppError(400, 'リクエストの形式が正しくありません');
}

// ---- 入力の検証（小さな手書きのもの） ----

const MAX_TEXT = 200_000;

export function optString(body: Record<string, unknown>, key: string, max = MAX_TEXT): string | undefined {
  const v = body[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'string') throw new AppError(400, `${key} は文字列で指定してください`);
  if (v.length > max) throw new AppError(400, `${key} が長すぎます（${max}文字まで）`);
  return v;
}

export function reqString(body: Record<string, unknown>, key: string, label: string, max = MAX_TEXT): string {
  const v = optString(body, key, max)?.trim();
  if (!v) throw new AppError(400, `${label}を入力してください`);
  return v;
}

export function optNullableString(body: Record<string, unknown>, key: string, max = 500): string | null | undefined {
  if (body[key] === null) return null;
  return optString(body, key, max);
}

export function optStringArray(body: Record<string, unknown>, key: string): string[] | undefined {
  const v = body[key];
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) {
    throw new AppError(400, `${key} は文字列の配列で指定してください`);
  }
  return [...new Set(v as string[])].slice(0, 500);
}
