// ブラウザで主要な流れを通しで確かめる E2E テスト（モック LLM を使うので API キー不要）。
//
//   npm run build
//   npm run e2e                      # スクリーンショットは test-results/ に保存
//
// Chromium の場所は CHROMIUM_PATH で指定できる（未指定なら playwright-core の既定）。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

const APP_PORT = Number(process.env.E2E_PORT) || 3199;
const MOCK_PORT = Number(process.env.E2E_MOCK_PORT) || 4019;
const BASE = `http://127.0.0.1:${APP_PORT}`;
const OUT = path.resolve('test-results');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'novel-e2e-'));
fs.mkdirSync(OUT, { recursive: true });

const procs = [];
let browser = null;
function start(cmd, args, env) {
  const p = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', (d) => process.env.E2E_VERBOSE && process.stdout.write(d));
  p.stderr.on('data', (d) => process.stderr.write(d));
  procs.push(p);
  return p;
}
async function cleanup() {
  await browser?.close().catch(() => {});
  for (const p of procs) p.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
}

async function waitFor(url) {
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      // まだ起動していない
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`timeout waiting for ${url}`);
}

async function api(p, method = 'GET', body) {
  const res = await fetch(BASE + p, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${p}: ${JSON.stringify(json)}`);
  return json;
}

function assert(cond, msg) {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

let shot = 0;
async function snap(page, name) {
  shot++;
  await page.waitForTimeout(350); // シートのアニメーションが終わるのを待つ
  const file = path.join(OUT, `${String(shot).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log('  📸', path.basename(file));
}

async function main() {
  // OpenRouter と同じくらい長いモデル一覧を返させる（シートの表示崩れを確かめるため）
  start('node', ['scripts/mock-llm.mjs'], { MOCK_PORT: String(MOCK_PORT), MOCK_DELAY_MS: '25', MOCK_MANY_MODELS: '1' });
  start('node_modules/.bin/next', ['start', '-H', '127.0.0.1', '-p', String(APP_PORT)], { DATA_DIR: dataDir });
  await waitFor(`http://127.0.0.1:${MOCK_PORT}/v1/models`);
  await waitFor(`${BASE}/api/settings`);

  // 既定の OpenRouter Provider をモックへ向ける
  const { providers } = await api('/api/providers');
  const pid = providers[0].id;
  await api(`/api/providers/${pid}`, 'PATCH', {
    baseUrl: `http://127.0.0.1:${MOCK_PORT}/v1`,
    apiKey: 'sk-or-v1-e2e000000000000000003f2a',
  });
  for (const purpose of ['writing', 'summary']) {
    await api('/api/settings', 'PATCH', { defaultModel: { purpose, providerId: pid, model: 'mock/writer' } });
  }
  await api('/api/settings', 'PATCH', { defaultModel: { purpose: 'image', providerId: pid, model: 'mock/image' } });

  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  console.log('Worlds（空）');
  await page.goto(BASE + '/');
  await page.getByText('まだ World がありません').waitFor();
  await snap(page, 'worlds-empty');

  console.log('World を作成');
  await page.getByRole('link', { name: '新しいWorld' }).click();
  await page.getByLabel('名前').fill('学園ミステリー');
  await page.getByLabel('説明').fill('旧校舎の噂をめぐる、静かな青春ミステリー。');
  await page.getByLabel('基礎執筆指示').fill('三人称一元視点。\n心理描写を重視する。\n説明しすぎず、行動や会話から情報を伝える。');
  await snap(page, 'world-new');
  await page.getByRole('button', { name: '保存' }).click();
  await page.getByRole('heading', { name: 'Episode 1' }).waitFor();
  const worldId = page.url().match(/\/w\/([^/]+)\/write/)[1];

  console.log('人物を追加（Write から）');
  await page.getByRole('link', { name: '人物を追加' }).click();
  await page.getByLabel('名前').fill('佐倉ミナ');
  await page.getByLabel('内容').fill('19歳。大学一年生。\n人付き合いが苦手だが観察力が高い。\n\n外見：\n黒髪のショートヘア。');
  await page.getByRole('button', { name: '保存' }).click();
  await page.getByRole('heading', { name: 'Episode 1' }).waitFor();

  // 残りは API で用意する
  await api(`/api/worlds/${worldId}/characters`, 'POST', { name: '朝倉レン', content: 'ミナの同級生。皮肉屋。' });
  await api(`/api/worlds/${worldId}/characters`, 'POST', { name: '教師', content: '担任。' });
  for (const [title, content] of [
    ['白ヶ丘高校', '創立80年の私立高校。旧校舎は10年前から閉鎖されている。'],
    ['10年前の事故', '旧校舎で起きた火災。'],
    ['魔法設定', '（この世界には魔法はない）'],
  ]) {
    await api(`/api/worlds/${worldId}/lore`, 'POST', { title, content });
  }
  await page.reload();

  console.log('Write — 入力');
  await page.getByRole('button', { name: '佐倉ミナ' }).click();
  await page.getByRole('button', { name: '朝倉レン' }).click();
  await page.getByRole('button', { name: '白ヶ丘高校' }).click();
  await page.getByRole('button', { name: '10年前の事故' }).click();
  await page.getByLabel('タイトル').fill('雨の屋上');
  await page.getByLabel('今回の指示').fill('今回は放課後の屋上でミナとレンが会話する。\n最初は険悪だが、最後には少しだけ互いへの警戒が薄れる。');
  assert((await page.getByRole('button', { name: '佐倉ミナ' }).getAttribute('aria-pressed')) === 'true', 'チップの選択');
  assert(await page.getByText('2 / 3 選択').first().isVisible(), '選択数の表示');
  await page.getByText('下書きを保存しました').waitFor({ timeout: 10_000 });
  await page.getByLabel('今回の指示').blur();
  await snap(page, 'write');

  console.log('Context Preview');
  await page.getByRole('button', { name: /Context/ }).click();
  await page.getByRole('dialog').getByText('合計（推定）').waitFor();
  await snap(page, 'context-preview');
  await page.getByRole('dialog').getByRole('button', { name: '閉じる' }).click();

  console.log('モデル選択');
  await page.getByRole('button', { name: 'モデル' }).click();
  await page.getByRole('dialog').getByText('mock/writer').waitFor();
  await snap(page, 'model-sheet');
  await page.getByRole('dialog').getByRole('button', { name: '閉じる' }).click();

  console.log('本文を生成');
  await page.getByRole('button', { name: '本文を生成' }).click();
  await page.waitForURL(/\/episodes\//);
  await page.getByText('候補 1 / 1').waitFor();
  await page.waitForFunction(() => document.querySelector('.prose-jp')?.textContent?.length > 20);
  await snap(page, 'generating');
  await page.getByRole('button', { name: 'この本文を採用' }).waitFor();
  await page.waitForFunction(() => !document.body.textContent.includes('生成中…'), null, { timeout: 30_000 });
  await snap(page, 'candidate-1');

  console.log('再生成');
  await page.getByRole('button', { name: '再生成' }).click();
  await page.getByText('候補 2 / 2').waitFor();
  await page.waitForFunction(() => !document.body.textContent.includes('生成中…'), null, { timeout: 30_000 });

  console.log('修正指示');
  await page.getByRole('button', { name: '修正指示' }).click();
  await page.getByRole('textbox', { name: '修正指示' }).fill('会話を増やしてください。');
  await snap(page, 'revise-sheet');
  await page.getByRole('button', { name: 'この指示で再生成' }).click();
  await page.getByText('候補 3 / 3').waitFor();
  await page.waitForFunction(() => !document.body.textContent.includes('生成中…'), null, { timeout: 30_000 });
  assert((await page.locator('.prose-jp').textContent()).includes('（修正版）'), '修正版の本文');
  await snap(page, 'candidate-3-revised');

  console.log('Snapshot');
  await page.getByRole('button', { name: 'この候補の Prompt Snapshot' }).click();
  await page.getByRole('dialog').getByText('修正指示', { exact: true }).waitFor();
  await page.getByRole('dialog').getByText('実測（Provider の集計）').waitFor();
  await snap(page, 'snapshot');
  await page.getByRole('dialog').getByRole('button', { name: '閉じる' }).click();

  console.log('候補 2 を採用');
  await page.getByRole('button', { name: '前の候補' }).click();
  await page.getByText('候補 2 / 3').waitFor();
  await page.getByRole('button', { name: 'この本文を採用' }).click();
  await page.getByText('候補 2 を採用しました').waitFor();
  await snap(page, 'adopted-summarizing');
  await page.getByText('未保存・AI生成').waitFor({ timeout: 20_000 });
  await snap(page, 'adopted-summary');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByText('保存済み').waitFor();

  console.log('採用の「変更」→ 採用中の候補が開く');
  await page.getByRole('button', { name: '変更' }).click();
  await page.getByText('候補 2 / 3').waitFor();
  assert(await page.getByRole('button', { name: '採用中' }).isDisabled(), '採用中は押せない');
  await page.getByRole('link', { name: '戻る' }).click();
  await page.getByText('この話は本文を採用済みです').waitFor();
  await page.getByRole('link', { name: '採用後の画面へ' }).click();
  await page.getByText('候補 2 を採用しました').waitFor();

  console.log('スチル');
  await page.getByRole('button', { name: /この場面のスチルを生成/ }).click();
  await page.getByLabel('追加指示').fill('雨の夜。映画的な構図。');
  await snap(page, 'still-sheet');
  await page.getByRole('button', { name: '生成', exact: true }).click();
  await page.getByRole('button', { name: /スチル（.*）を拡大/ }).waitFor({ timeout: 20_000 });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await snap(page, 'adopted-still');
  await page.getByRole('button', { name: /スチル（.*）を拡大/ }).click();
  await page.getByRole('dialog').getByText('Prompt', { exact: true }).waitFor();
  await snap(page, 'still-viewer');
  await page.getByRole('dialog').getByRole('button', { name: '閉じる' }).click();

  console.log('次のエピソードへ');
  await page.getByRole('button', { name: '次のエピソードへ' }).click();
  await page.getByRole('heading', { name: 'Episode 2' }).waitFor();
  assert((await page.locator('#sec-prev').textContent()).includes('Ep.1'), '前回までの要約 · Ep.1');
  assert(
    (await page.getByRole('button', { name: '朝倉レン' }).getAttribute('aria-pressed')) === 'true',
    '人物の選択を引き継ぐ',
  );
  await snap(page, 'write-ep2');

  console.log('Library');
  await page.getByRole('link', { name: 'Library' }).click();
  await page.getByRole('heading', { name: 'Library' }).waitFor();
  await snap(page, 'library-characters');
  for (const [tab, name] of [
    ['ロア', 'library-lore'],
    ['話', 'library-episodes'],
    ['スチル', 'library-stills'],
  ]) {
    await page.getByRole('tab', { name: tab }).click();
    await page.waitForURL(new RegExp(`tab=`));
    await page.waitForTimeout(300);
    await snap(page, name);
  }

  console.log('Write タブ（最新の Ep.2 の入力画面へ）');
  await page.getByRole('link', { name: 'Write' }).click();
  await page.getByRole('heading', { name: 'Episode 2' }).waitFor();

  console.log('Settings');
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('heading', { name: 'PROVIDER' }).waitFor();
  assert(await page.getByText('sk-or-••••••••3f2a').isVisible(), 'API キーは伏せ字で表示');
  await snap(page, 'settings');

  console.log('Settings — 既定モデルの選択シート');
  await page.getByRole('button', { name: /^執筆/ }).click();
  const sheet = page.getByRole('dialog', { name: '既定モデル（執筆）' });
  await sheet.getByText('anthropic/claude-opus-5.5').waitFor();
  await page.waitForTimeout(350); // 開くときのアニメーションが終わるのを待つ
  const box = await sheet.boundingBox();
  const vh = page.viewportSize().height;
  assert(box && box.height > vh * 0.6, `一覧の多いシートは画面の大部分を使う（高さ ${box?.height}）`);
  assert(box && Math.abs(box.y + box.height - vh) < 2, `シートは画面の下端に付く（y=${box?.y} h=${box?.height} vh=${vh}）`);
  await snap(page, 'settings-model-sheet');
  await sheet.getByRole('button', { name: 'mock/think' }).click();
  await page.getByText('mock/think').first().waitFor();
  await page.getByRole('button', { name: /^執筆/ }).click();
  await page.getByRole('dialog', { name: '既定モデル（執筆）' }).getByRole('button', { name: 'mock/writer' }).click();
  await page.getByRole('button', { name: /^執筆.*mock\/writer/ }).waitFor();
  await page.getByRole('link', { name: /OpenRouter/ }).click();
  await page.getByRole('button', { name: '接続テスト' }).click();
  await page.getByText('接続できました').waitFor();
  await snap(page, 'provider-edit');

  console.log('Worlds（作業中）');
  await page.goto(BASE + '/');
  await page.getByText('作業中').waitFor();
  await snap(page, 'worlds');

  // API キーがブラウザへ届いていないこと（機能仕様 §40-24）
  const html = await page.content();
  const settingsJson = JSON.stringify(await api('/api/providers'));
  assert(!html.includes('e2e000000000000000') && !settingsJson.includes('e2e000000000000000'), 'API キーを返さない');

  // PC 幅
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto(`${BASE}/w/${worldId}/write`);
  await page.getByRole('heading', { name: 'Episode 2' }).waitFor();
  await snap(page, 'write-desktop');

  assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join('\n')}`);
  await browser.close();
  console.log('\n✓ E2E OK');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(cleanup);
