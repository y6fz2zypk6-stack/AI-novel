import 'server-only';
import type { GenerationRow } from '@/lib/db/schema';
import { buildContext, OUTPUT_INSTRUCTION, SYSTEM_INSTRUCTION } from '@/lib/prompt';
import type { GenerationPoll, PromptSnapshot } from '@/lib/types';
import { AppError, notFound } from './http';
import { newId } from './ids';
import { generationJobs, runningGenerationFor, type TextJob } from './jobs';
import { textProvider, type ResolvedProvider } from './llm/client';
import { LLMError, describeError } from './llm/errors';
import { resolveModel } from './models';
import { getEpisode } from './repo/episodes';
import { getGeneration, insertGeneration, updateGeneration } from './repo/generations';
import { getSettings } from './repo/providers';
import { getWorld, listCharacters, listLore, touchWorld } from './repo/worlds';

/** 生成途中の本文を DB に書き出す間隔（プロセスが落ちても途中までは残る） */
const FLUSH_INTERVAL_MS = 3000;

/**
 * 本文生成を開始し、Generation の ID を返す。生成はバックグラウンドで続く。
 * revisionOf を指定すると、その本文に修正指示を加えて全文を書き直す（機能仕様 §13）。
 */
export function startGeneration(
  episodeId: string,
  opts: { revisionOf?: string | null; revisionNote?: string | null } = {},
): string {
  const ep = getEpisode(episodeId);
  if (!ep) throw notFound('エピソード');
  if (runningGenerationFor(episodeId)) throw new AppError(409, 'このエピソードは生成中です。終わるまでお待ちください。');
  const world = getWorld(ep.worldId);
  if (!world) throw notFound('World');

  let revision: PromptSnapshot['revision'] = null;
  if (opts.revisionOf) {
    const base = getGeneration(opts.revisionOf);
    if (!base || base.episodeId !== episodeId) throw notFound('修正元の候補');
    if (!base.content.trim()) throw new AppError(400, '修正元の候補に本文がありません');
    const note = opts.revisionNote?.trim() ?? '';
    if (!note) throw new AppError(400, '修正指示を入力してください');
    revision = { baseGenerationId: base.id, baseContent: base.content, note };
  }

  const { provider, model } = resolveModel(
    'writing',
    ep.writingProviderId && ep.writingModel ? { providerId: ep.writingProviderId, model: ep.writingModel } : null,
  );
  const settings = getSettings();
  const generationSettings = { temperature: settings.temperature, maxTokens: settings.maxTokens };

  const chars = listCharacters(world.id).filter((c) => ep.characterIds.includes(c.id));
  const lores = listLore(world.id).filter((l) => ep.loreIds.includes(l.id));
  const ctx = buildContext({
    worldInstruction: world.baseInstruction,
    characters: chars,
    lore: lores,
    previousSummary: ep.previousSummary,
    episodeNumber: ep.episodeNumber,
    episodeTitle: ep.title,
    episodeInstruction: ep.instruction,
    revision: revision ? { baseContent: revision.baseContent, note: revision.note } : null,
  });

  const snapshot: PromptSnapshot = {
    version: 1,
    provider: { id: provider.id, name: provider.name, type: provider.type, baseUrl: provider.baseUrl },
    model,
    systemInstruction: SYSTEM_INSTRUCTION,
    worldInstruction: world.baseInstruction,
    characters: chars.map((c) => ({ id: c.id, name: c.name, content: c.content })),
    lore: lores.map((l) => ({ id: l.id, title: l.title, content: l.content })),
    previousSummary: ep.previousSummary,
    episodeNumber: ep.episodeNumber,
    episodeTitle: ep.title,
    episodeInstruction: ep.instruction,
    outputInstruction: OUTPUT_INSTRUCTION,
    revision,
    generationSettings,
    messages: ctx.messages,
  };

  const row: GenerationRow = {
    id: newId(),
    episodeId,
    provider: provider.name,
    model,
    content: '',
    promptSnapshot: snapshot,
    generationSettings,
    status: 'generating',
    error: null,
    finishReason: null,
    usage: null,
    revisionOf: revision?.baseGenerationId ?? null,
    revisionNote: revision?.note ?? null,
    createdAt: Date.now(),
    finishedAt: null,
  };
  insertGeneration(row);
  touchWorld(world.id);

  const job: TextJob = {
    generationId: row.id,
    episodeId,
    content: '',
    thinking: false,
    abort: new AbortController(),
    startedAt: Date.now(),
  };
  generationJobs.set(row.id, job);
  void runGeneration(job, provider, snapshot);
  return row.id;
}

async function runGeneration(job: TextJob, provider: ResolvedProvider, snapshot: PromptSnapshot): Promise<void> {
  let lastFlush = Date.now();
  try {
    const result = await textProvider(provider).generateText({
      model: snapshot.model,
      messages: snapshot.messages,
      temperature: snapshot.generationSettings.temperature,
      maxTokens: snapshot.generationSettings.maxTokens,
      signal: job.abort.signal,
      onDelta: (text) => {
        job.content += text;
        job.thinking = false;
        if (Date.now() - lastFlush > FLUSH_INTERVAL_MS) {
          lastFlush = Date.now();
          updateGeneration(job.generationId, { content: job.content });
        }
      },
      onReasoning: () => {
        if (!job.content) job.thinking = true;
      },
    });
    if (!job.content.trim()) {
      const reason = result.finishReason ? `finish_reason: ${result.finishReason}` : undefined;
      throw new LLMError('empty', { detail: reason });
    }
    updateGeneration(job.generationId, {
      content: job.content,
      status: 'done',
      finishReason: result.finishReason,
      usage: result.usage,
      finishedAt: Date.now(),
    });
  } catch (err) {
    const stopped = err instanceof LLMError && err.kind === 'aborted';
    if (!stopped) console.error('[generation]', job.generationId, err);
    try {
      updateGeneration(job.generationId, {
        content: job.content,
        status: stopped ? 'stopped' : 'error',
        error: stopped ? null : describeError(err),
        finishedAt: Date.now(),
      });
    } catch (dbErr) {
      console.error('[generation] failed to save error state', dbErr);
    }
  } finally {
    generationJobs.delete(job.generationId);
  }
}

export function stopGeneration(generationId: string): boolean {
  const job = generationJobs.get(generationId);
  if (!job) return false;
  job.abort.abort();
  return true;
}

/** 生成中の本文をポーリングで取りに来るときの応答。from 以降の差分だけを返す */
export function pollGeneration(generationId: string, from: number): GenerationPoll {
  const job = generationJobs.get(generationId);
  if (job) {
    return {
      id: generationId,
      status: 'generating',
      delta: job.content.slice(from),
      length: job.content.length,
      thinking: job.thinking,
      error: null,
      finishReason: null,
      usage: null,
      finishedAt: null,
    };
  }
  let row = getGeneration(generationId);
  if (!row) throw notFound('候補');
  if (row.status === 'generating') {
    // ジョブが無いのに生成中のまま = サーバーが再起動して中断された
    updateGeneration(row.id, {
      status: 'error',
      error: 'サーバーが再起動したため、生成が中断されました。',
      finishedAt: Date.now(),
    });
    row = getGeneration(generationId)!;
  }
  return {
    id: row.id,
    status: row.status,
    delta: row.content.slice(from),
    length: row.content.length,
    thinking: false,
    error: row.error,
    finishReason: row.finishReason,
    usage: row.usage ?? null,
    finishedAt: row.finishedAt,
  };
}

/** ページ表示用。中断されたまま残った「生成中」を整えてから返す */
export function settleStaleGeneration(row: GenerationRow): GenerationRow {
  if (row.status !== 'generating' || generationJobs.has(row.id)) {
    const job = generationJobs.get(row.id);
    return job ? { ...row, content: job.content } : row;
  }
  pollGeneration(row.id, 0);
  return getGeneration(row.id) ?? row;
}
