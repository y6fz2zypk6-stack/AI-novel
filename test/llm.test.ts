import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { imageProvider, listModels, textProvider, type ResolvedProvider } from '../src/lib/server/llm/client';
import { LLMError, classifyHttpError, describeError } from '../src/lib/server/llm/errors';

// テストごとに応答を差し替えられる小さな OpenAI 互換サーバー
type Handler = (req: http.IncomingMessage, body: Record<string, unknown>, res: http.ServerResponse) => void;
let handler: Handler = (_req, _body, res) => res.end();
const requests: { path: string; body: Record<string, unknown>; headers: http.IncomingHttpHeaders }[] = [];
let server: http.Server;
let baseUrl = '';

before(async () => {
  server = http.createServer((req, res) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      const body = data ? (JSON.parse(data) as Record<string, unknown>) : {};
      requests.push({ path: req.url ?? '', body, headers: req.headers });
      handler(req, body, res);
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});
after(() => server.close());

const provider = (type: ResolvedProvider['type'] = 'openai-compatible', apiKey: string | null = 'k'): ResolvedProvider => ({
  id: 'p',
  name: 'Test',
  type,
  baseUrl,
  apiKey,
});

function sse(res: http.ServerResponse, events: unknown[]) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  res.write(': keep-alive\n\n');
  for (const e of events) res.write(`data: ${JSON.stringify(e)}\n\n`);
  res.end('data: [DONE]\n\n');
}

describe('本文生成（SSE）', () => {
  it('差分を順に受け取り、本文・finish_reason・usage を返す', async () => {
    handler = (_req, _body, res) =>
      sse(res, [
        { choices: [{ delta: { reasoning: '…' } }] },
        { choices: [{ delta: { content: '雨の' } }] },
        { choices: [{ delta: { content: '屋上' }, finish_reason: 'stop' }] },
        { choices: [], usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 } },
      ]);
    const deltas: string[] = [];
    let reasoning = 0;
    const result = await textProvider(provider()).generateText({
      model: 'm',
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0.8,
      maxTokens: 100,
      onDelta: (t) => deltas.push(t),
      onReasoning: () => reasoning++,
    });
    assert.equal(result.text, '雨の屋上');
    assert.deepEqual(deltas, ['雨の', '屋上']);
    assert.equal(reasoning, 1);
    assert.equal(result.finishReason, 'stop');
    assert.deepEqual(result.usage, { promptTokens: 10, completionTokens: 4, totalTokens: 14, cost: undefined });
    const sent = requests.at(-1)!;
    assert.equal(sent.path, '/v1/chat/completions');
    assert.equal(sent.body.stream, true);
    assert.equal(sent.body.max_tokens, 100);
    assert.equal(sent.headers.authorization, 'Bearer k');
    assert.equal(sent.headers['x-title'], undefined, 'OpenRouter 用のヘッダは付けない');
  });

  it('OpenRouter にはアプリ名のヘッダを付ける。キーが無い互換 API には Authorization を送らない', async () => {
    handler = (_req, _body, res) => sse(res, [{ choices: [{ delta: { content: 'x' } }] }]);
    await textProvider(provider('openrouter')).generateText({ model: 'm', messages: [] });
    assert.equal(requests.at(-1)!.headers['x-title'], 'Novel Studio');
    await textProvider(provider('openai-compatible', null)).generateText({ model: 'm', messages: [] });
    assert.equal(requests.at(-1)!.headers.authorization, undefined);
  });

  it('ストリームを使わず JSON で返す実装にも対応する', async () => {
    handler = (_req, _body, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: '一括' }, finish_reason: 'stop' }] }));
    };
    const result = await textProvider(provider()).generateText({ model: 'm', messages: [] });
    assert.equal(result.text, '一括');
  });

  it('max_tokens を受け付けないモデルには max_completion_tokens で送り直す', async () => {
    handler = (_req, body, res) => {
      if ('max_tokens' in body) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: { message: "Unsupported parameter: 'max_tokens'. Use 'max_completion_tokens' instead." },
          }),
        );
        return;
      }
      sse(res, [{ choices: [{ delta: { content: 'ok' } }] }]);
    };
    const result = await textProvider(provider()).generateText({ model: 'm', messages: [], maxTokens: 50 });
    assert.equal(result.text, 'ok');
    assert.equal(requests.at(-1)!.body.max_completion_tokens, 50);
  });

  it('ストリームの途中で届いたエラーを分類する', async () => {
    handler = (_req, _body, res) =>
      sse(res, [{ choices: [{ delta: { content: '途中' } }] }, { error: { code: 429, message: 'Rate limited' } }]);
    await assert.rejects(
      textProvider(provider()).generateText({ model: 'm', messages: [] }),
      (err: unknown) => err instanceof LLMError && err.kind === 'rate',
    );
  });

  it('停止すると aborted で終わる', async () => {
    handler = (_req, _body, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'a' } }] })}\n\n`);
      // 終わらないストリーム
    };
    const ctl = new AbortController();
    const p = textProvider(provider()).generateText({
      model: 'm',
      messages: [],
      signal: ctl.signal,
      onDelta: () => ctl.abort(),
    });
    await assert.rejects(p, (err: unknown) => err instanceof LLMError && err.kind === 'aborted');
  });

  it('接続できないときは connection', async () => {
    const dead: ResolvedProvider = { ...provider(), baseUrl: 'http://127.0.0.1:9/v1' };
    await assert.rejects(
      textProvider(dead).generateText({ model: 'm', messages: [] }),
      (err: unknown) => err instanceof LLMError && err.kind === 'connection',
    );
  });
});

describe('画像生成', () => {
  const png = Buffer.from('89504e470d0a1a0a0000', 'hex');

  it('OpenRouter は /images を使う', async () => {
    handler = (_req, _body, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }));
    };
    const img = await imageProvider(provider('openrouter')).generateImage({ model: 'i', prompt: 'p', aspectRatio: '3:4' });
    assert.equal(img.mime, 'image/png');
    assert.equal(requests.at(-1)!.path, '/v1/images');
    assert.equal(requests.at(-1)!.body.aspect_ratio, '3:4');
  });

  it('OpenAI 互換は /images/generations。縦長サイズを断られたら size を外して送り直す', async () => {
    handler = (_req, body, res) => {
      if (body.size) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Invalid size' } }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }));
    };
    const img = await imageProvider(provider()).generateImage({ model: 'i', prompt: 'p', aspectRatio: '3:4' });
    assert.ok(img.data.length > 0);
    assert.equal(requests.at(-1)!.path, '/v1/images/generations');
    assert.equal(requests.at(-1)!.body.size, undefined);
  });
});

describe('モデル一覧', () => {
  it('OpenRouter の画像モデルは /images/models から取る', async () => {
    handler = (req, _body, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: req.url?.includes('/images/models') ? [{ id: 'b/img' }, { id: 'a/img' }] : [] }));
    };
    const models = await listModels(provider('openrouter'), 'image');
    assert.deepEqual(
      models.map((m) => m.id),
      ['a/img', 'b/img'],
    );
  });
});

describe('エラーの分類（機能仕様 §35）', () => {
  const cases: [number, string, string][] = [
    [401, '{"error":{"message":"Invalid key"}}', 'auth'],
    [402, '{"error":{"message":"Insufficient credits"}}', 'credits'],
    [429, '{"error":{"message":"Too many"}}', 'rate'],
    [400, '{"error":{"message":"This model\'s maximum context length is 8192 tokens"}}', 'context'],
    [400, '{"error":{"message":"foo/bar is not a valid model ID"}}', 'model'],
    [404, '{"error":{"message":"No endpoints found for x"}}', 'model'],
    [403, '{"error":{"message":"Input was flagged by moderation"}}', 'moderation'],
    [503, 'Service Unavailable', 'server'],
    [408, '', 'timeout'],
  ];
  for (const [status, body, kind] of cases) {
    it(`${status} → ${kind}`, () => assert.equal(classifyHttpError(status, body).kind, kind));
  }

  it('画面に出す文言には上流の詳細を添える', () => {
    const msg = describeError(classifyHttpError(429, '{"error":{"message":"slow down"}}'));
    assert.match(msg, /レート制限/);
    assert.match(msg, /429 slow down/);
  });
});
