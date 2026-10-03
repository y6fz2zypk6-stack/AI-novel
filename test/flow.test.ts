// DB とバックグラウンド処理を含む一連の流れ（モック LLM を相手に実際に生成する）
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

const MOCK_PORT = 4029;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'novel-test-'));
process.env.DATA_DIR = dataDir;
delete process.env.APP_SECRET;
delete process.env.OPENROUTER_API_KEY;

let mock: ChildProcess;

async function until<T>(fn: () => T | undefined | null | false, timeoutMs = 10_000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - start > timeoutMs) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 30));
  }
}

before(async () => {
  mock = spawn('node', ['scripts/mock-llm.mjs'], {
    env: { ...process.env, MOCK_PORT: String(MOCK_PORT), MOCK_DELAY_MS: '2' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${MOCK_PORT}/v1/models`)).ok) return;
    } catch {
      // 起動待ち
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('mock did not start');
});

after(() => {
  mock.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('執筆の一連の流れ', () => {
  it('生成 → 採用 → 要約 → 次の話 → スチル', async () => {
    const { getDb } = await import('../src/lib/server/db');
    const worlds = await import('../src/lib/server/repo/worlds');
    const episodes = await import('../src/lib/server/repo/episodes');
    const providers = await import('../src/lib/server/repo/providers');
    const gens = await import('../src/lib/server/repo/generations');
    const imagesRepo = await import('../src/lib/server/repo/images');
    const { startGeneration, pollGeneration } = await import('../src/lib/server/generation');
    const { startSummary } = await import('../src/lib/server/summary');
    const { startStill } = await import('../src/lib/server/stills');
    const { taskState } = await import('../src/lib/server/jobs');
    const { AppError } = await import('../src/lib/server/http');
    const { generations } = await import('../src/lib/db/schema');

    getDb();
    // 初回起動で OpenRouter の Provider が1つ用意される
    const [seed] = providers.listProviders();
    assert.equal(seed.providerType, 'openrouter');

    // モックへ向け、API キーを保存する（暗号化されて保存される）
    providers.updateProvider(seed.id, {
      baseUrl: `http://127.0.0.1:${MOCK_PORT}/v1`,
      apiKey: 'sk-or-v1-secret-value-1234',
      defaultTextModel: 'mock/writer',
      defaultSummaryModel: 'mock/writer',
      defaultImageModel: 'mock/image',
    });
    const stored = providers.getProvider(seed.id)!;
    assert.ok(stored.encryptedApiKey && !stored.encryptedApiKey.includes('secret-value'), 'キーは平文で保存しない');
    assert.equal(providers.toProviderView(stored).maskedKey, 'sk-or-••••••••1234');
    assert.ok(fs.existsSync(path.join(dataDir, 'secret.key')), '暗号鍵を自動生成する');

    const w = worlds.createWorld({ name: '学園', description: '', baseInstruction: '三人称。' });
    const mina = worlds.createCharacter(w.id, { name: 'ミナ', content: '黒髪。' });
    const ren = worlds.createCharacter(w.id, { name: 'レン', content: '皮肉屋。' });
    const school = worlds.createLore(w.id, { title: '白ヶ丘高校', content: '創立80年。' });
    const ep1 = episodes.createEpisode(w.id);
    assert.equal(ep1.episodeNumber, 1);
    episodes.updateEpisodeDraft(ep1.id, {
      title: '雨の屋上',
      instruction: '会話する。',
      characterIds: [ren.id, mina.id, 'other-world-id'],
      loreIds: [school.id],
    });
    assert.deepEqual(episodes.getEpisode(ep1.id)!.characterIds, [mina.id, ren.id], '他の World の ID は入れない');

    // 本文生成（バックグラウンド）
    const g1 = startGeneration(ep1.id);
    assert.throws(() => startGeneration(ep1.id), (e: unknown) => e instanceof AppError && e.status === 409);
    const done = await until(() => {
      const p = pollGeneration(g1, 0);
      return p.status !== 'generating' && p;
    });
    assert.equal(done.status, 'done');
    assert.match(done.delta, /^放課後の屋上は/);
    assert.equal(done.finishReason, 'stop');
    assert.equal(done.usage?.promptTokens, 1234);
    const row = gens.getGeneration(g1)!;
    assert.deepEqual(
      row.promptSnapshot.characters.map((c) => c.name),
      ['ミナ', 'レン'],
    );
    assert.equal(row.promptSnapshot.model, 'mock/writer');
    assert.equal(row.content, done.delta);

    // 後から人物を編集しても Snapshot は変わらない（機能仕様 §18）
    worlds.updateCharacter(mina.id, { content: '金髪に変更' });
    assert.equal(gens.getGeneration(g1)!.promptSnapshot.characters[0].content, '黒髪。');

    // 修正指示付き再生成
    const g2 = startGeneration(ep1.id, { revisionOf: g1, revisionNote: '会話を増やす' });
    await until(() => pollGeneration(g2, 0).status === 'done');
    const r2 = gens.getGeneration(g2)!;
    assert.equal(r2.revisionOf, g1);
    assert.match(r2.content, /^（修正版）/);
    assert.equal(r2.promptSnapshot.messages.at(-2)?.role, 'assistant');

    // 採用 → 要約（未保存の下書きとして残る）
    episodes.setAccepted(ep1.id, g1);
    startSummary(ep1.id);
    assert.equal(taskState('summary', ep1.id)?.status, 'running');
    await until(() => taskState('summary', ep1.id) === null);
    let ep = episodes.getEpisode(ep1.id)!;
    assert.equal(ep.summaryDraftSource, 'ai');
    assert.match(ep.summaryDraft ?? '', /起きた出来事/);
    assert.equal(ep.summary, '', '自動生成した要約は確定扱いしない');
    assert.equal(ep.summaryGenerationId, g1);
    episodes.saveSummary(ep1.id, '確定した要約');
    ep = episodes.getEpisode(ep1.id)!;
    assert.equal(ep.summary, '確定した要約');
    assert.equal(ep.summaryDraft, null);

    // 次の話：前の話の要約と人物・ロアの選択を引き継ぐ
    const ep2 = episodes.createEpisode(w.id);
    const ep2full = episodes.getEpisode(ep2.id)!;
    assert.equal(ep2full.episodeNumber, 2);
    assert.equal(ep2full.previousSummary, '確定した要約');
    assert.deepEqual(ep2full.characterIds, [mina.id, ren.id]);
    assert.deepEqual(ep2full.loreIds, [school.id]);

    // スチル
    startStill(ep1.id, { instruction: '雨の夜' });
    await until(() => taskState('image', ep1.id) === null);
    const imgs = imagesRepo.listEpisodeImages(ep1.id);
    assert.equal(imgs.length, 1);
    assert.match(imgs[0].prompt, /rooftop/);
    assert.equal(imgs[0].instruction, '雨の夜');
    assert.equal(imgs[0].generationId, g1);
    const file = imagesRepo.resolveDataPath(imgs[0].filePath)!;
    const thumb = imagesRepo.resolveDataPath(imgs[0].thumbPath!)!;
    assert.ok(fs.existsSync(file) && fs.existsSync(thumb));

    // 一覧の件数
    const list = episodes.listEpisodes(w.id);
    assert.deepEqual(
      list.map((e) => [e.episodeNumber, e.generationCount, e.imageCount]),
      [
        [2, 0, 0],
        [1, 2, 1],
      ],
    );
    const wl = worlds.listWorlds().find((x) => x.id === w.id)!;
    assert.deepEqual([wl.latestEpisodeNumber, wl.characterCount, wl.loreCount], [2, 2, 1]);

    // Episode を消すと画像ファイルも消える
    imagesRepo.deleteImageFilesForEpisodes([ep1.id]);
    episodes.deleteEpisode(ep1.id);
    assert.ok(!fs.existsSync(file) && !fs.existsSync(thumb));
    assert.equal(gens.listGenerations(ep1.id).length, 0, '候補も一緒に消える');

    // サーバー再起動で中断された「生成中」は、読みに来たときにエラーへ直す
    getDb()
      .insert(generations)
      .values({ ...row, id: 'stale-gen', episodeId: ep2.id, status: 'generating', content: '途中まで' })
      .run();
    const stale = pollGeneration('stale-gen', 0);
    assert.equal(stale.status, 'error');
    assert.equal(stale.delta, '途中まで', '途中までの本文は残す');
  });

  it('API キーが無い OpenRouter では生成を始めない', async () => {
    const providers = await import('../src/lib/server/repo/providers');
    const { resolveModel } = await import('../src/lib/server/models');
    const [p] = providers.listProviders();
    providers.updateProvider(p.id, { apiKey: '' });
    assert.throws(() => resolveModel('writing'), /API キーが設定されていません/);
    process.env.OPENROUTER_API_KEY = 'sk-or-v1-from-env-5678';
    assert.equal(resolveModel('writing').provider.apiKey, 'sk-or-v1-from-env-5678');
    assert.equal(providers.toProviderView(providers.getProvider(p.id)!).keySource, 'env');
    delete process.env.OPENROUTER_API_KEY;
  });
});
