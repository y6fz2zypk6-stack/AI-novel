// テスト・動作確認用の OpenAI 互換モックサーバー（本物の API キーは不要）。
//   node scripts/mock-llm.mjs            # http://127.0.0.1:4010/v1
//   MOCK_PORT=4011 node scripts/mock-llm.mjs
//
// Settings の Provider の Base URL を http://127.0.0.1:4010/v1 にすると、アプリ全体を試せる。
// モデル名で挙動を変えられる:
//   mock/writer   … 本文をゆっくりストリーミング（既定）
//   mock/think    … 推論（reasoning）を流してから本文
//   mock/error-429 / mock/error-401 / mock/context … エラーを返す
//   mock/image    … 画像（PNG）を返す
import http from 'node:http';
import zlib from 'node:zlib';

const PORT = Number(process.env.MOCK_PORT) || 4010;
const CHUNK_DELAY = Number(process.env.MOCK_DELAY_MS ?? 40);

const STORY = [
  '放課後の屋上は、雨上がりの匂いがした。',
  'フェンスの向こうで、街の灯りがひとつずつ点いていく。ミナは手すりに肘をつき、濡れたコンクリートに映る自分の影を見下ろしていた。',
  '「まだいたのか」',
  '背後から声がして、ミナは振り返らなかった。足音だけで、誰なのかはわかっていた。',
  '「レンこそ。部活は？」',
  '「休んだ」レンは少し離れた場所に立ち、同じように街を見た。「……旧校舎の噂、本当だと思うか」',
  'ミナは答えるかわりに、ポケットの中の古い鍵を握りしめた。十年前の夜のことを、彼女はまだ半分しか思い出せない。',
  '◇',
  '風が止んだ。遠くでチャイムが鳴り、二人のあいだの沈黙が、ほんの少しだけやわらいだ気がした。',
].join('\n');

const SUMMARY = `## 起きた出来事
- 放課後の屋上でミナとレンが会話した
- レンは部活を休んでミナに会いに来た

## キャラクター間の関係変化
- 最初は険悪だったが、最後には互いへの警戒が少し薄れた

## 新しく判明した情報
- ミナは旧校舎に関係する古い鍵を持っている

## 現在の場所・状況
- 夕方、雨上がりの屋上

## 未回収の伏線
- 旧校舎の噂 / 十年前の夜の記憶

## 持ち物
- ミナ：古い鍵

## 負傷
- なし

## 約束
- なし`;

const IMAGE_PROMPT =
  'A rain-soaked school rooftop at dusk, a short-haired girl leaning on the railing, city lights below, cinematic composition, vertical 3:4, no text';

// 単色の小さな PNG（120x160）を作る
function makePng(width = 120, height = 160, rgb = [227, 168, 87]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) row.set(rgb, 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const PNG_B64 = makePng().toString('base64');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'));
      } catch {
        resolve({});
      }
    });
  });
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function errorFor(model) {
  if (model === 'mock/error-429') return [429, { error: { message: 'Rate limit exceeded', code: 429 } }];
  if (model === 'mock/error-401') return [401, { error: { message: 'Invalid API key', code: 401 } }];
  if (model === 'mock/context')
    return [400, { error: { message: "This model's maximum context length is 8192 tokens", code: 400 } }];
  if (model === 'mock/missing') return [400, { error: { message: 'mock/missing is not a valid model ID', code: 400 } }];
  return null;
}

// MOCK_MANY_MODELS=1 のとき、OpenRouter のような長いモデルIDを数百件返す（画面の確認用）
const LONG_IDS = [
  ['anthropic/claude-opus-5.5', 'Anthropic: Claude Opus 5.5'],
  ['anthropic/claude-sonnet-5.5', 'Anthropic: Claude Sonnet 5.5'],
  ['google/gemini-2.5-flash-image-preview', 'Google: Gemini 2.5 Flash Image Preview (Nano Banana)'],
  ['nousresearch/hermes-3-llama-3.1-405b:free', 'Nous: Hermes 3 405B Instruct (free)'],
  ['meta-llama/llama-3.3-70b-instruct:free', 'Meta: Llama 3.3 70B Instruct (free)'],
  ['deepseek/deepseek-r1-distill-llama-70b', 'DeepSeek: R1 Distill Llama 70B'],
  ['mistralai/mistral-small-3.2-24b-instruct-2506', 'Mistral: Mistral Small 3.2 24B Instruct 2506'],
];
const MANY_MODELS = process.env.MOCK_MANY_MODELS
  ? [
      ...LONG_IDS.map(([id, name]) => ({ id, name, context_length: 1048576, architecture: { output_modalities: ['text'] } })),
      ...Array.from({ length: 400 }, (_, i) => ({
        id: `vendor${i % 40}/very-long-model-name-for-layout-check-${i}-instruct-preview`,
        name: `Vendor ${i % 40}: Very Long Model Name For Layout Check ${i} Instruct Preview`,
        context_length: 131072,
        architecture: { output_modalities: ['text'] },
      })),
    ]
  : [];

/** 呼び出しの記録（テストから GET /__calls で見られる） */
const calls = [];

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname.replace(/^\/v1/, '');

  if (req.method === 'GET' && url.pathname === '/__calls') return json(res, 200, { calls });
  if (req.method === 'DELETE' && url.pathname === '/__calls') {
    calls.length = 0;
    return json(res, 200, { ok: true });
  }

  if (req.method === 'GET' && path === '/models') {
    return json(res, 200, {
      data: [
        { id: 'mock/writer', name: 'Mock Writer', context_length: 200000, architecture: { output_modalities: ['text'] } },
        { id: 'mock/think', name: 'Mock Thinker', context_length: 200000, architecture: { output_modalities: ['text'] } },
        { id: 'mock/image', name: 'Mock Image', context_length: 0, architecture: { output_modalities: ['image'] } },
        ...MANY_MODELS,
      ],
    });
  }
  if (req.method === 'GET' && path === '/images/models') {
    return json(res, 200, { data: [{ id: 'mock/image', name: 'Mock Image' }] });
  }
  if (req.method === 'GET' && path === '/key') {
    if (!req.headers.authorization) return json(res, 401, { error: { message: 'No auth credentials found' } });
    return json(res, 200, { data: { label: 'mock-key' } });
  }

  if (req.method === 'POST' && path === '/chat/completions') {
    const body = await readBody(req);
    calls.push({ path, body, auth: req.headers.authorization ?? null });
    const err = errorFor(body.model);
    if (err) return json(res, err[0], err[1]);

    const userText = (body.messages ?? []).map((m) => m.content).join('\n');
    let text = STORY;
    if (userText.includes('[今回の本文：')) text = SUMMARY;
    else if (userText.includes('画像生成プロンプト')) text = IMAGE_PROMPT;
    else if (userText.includes('[REVISION]')) text = `（修正版）\n${STORY}`;

    if (!body.stream) {
      return json(res, 200, {
        choices: [{ message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1000, completion_tokens: 300, total_tokens: 1300 },
      });
    }
    let closed = false;
    res.on('close', () => (closed = true));
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    res.write(': MOCK PROCESSING\n\n');
    if (body.model === 'mock/think') {
      for (let i = 0; i < 5; i++) {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { reasoning: '考えています…' } }] })}\n\n`);
        await sleep(CHUNK_DELAY * 3);
      }
    }
    const pieces = text.match(/[\s\S]{1,12}/g) ?? [];
    for (const piece of pieces) {
      if (closed) return;
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`);
      await sleep(CHUNK_DELAY);
    }
    res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`);
    res.write(
      `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 1234, completion_tokens: 567, total_tokens: 1801, cost: 0.0123 } })}\n\n`,
    );
    res.write('data: [DONE]\n\n');
    return res.end();
  }

  if (req.method === 'POST' && (path === '/images' || path === '/images/generations')) {
    const body = await readBody(req);
    calls.push({ path, body, auth: req.headers.authorization ?? null });
    const err = errorFor(body.model);
    if (err) return json(res, err[0], err[1]);
    await sleep(CHUNK_DELAY * 5);
    return json(res, 200, { data: [{ b64_json: PNG_B64, media_type: 'image/png' }] });
  }

  json(res, 404, { error: { message: `not found: ${req.method} ${url.pathname}` } });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`mock LLM listening on http://127.0.0.1:${PORT}/v1`);
});
