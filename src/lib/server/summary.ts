import 'server-only';
import { buildSummaryMessages } from '@/lib/prompt';
import { AppError, notFound } from './http';
import { getTask, runTask } from './jobs';
import { textProvider } from './llm/client';
import { LLMError, describeError } from './llm/errors';
import { resolveModel } from './models';
import { getEpisode, saveSummaryDraft } from './repo/episodes';
import { getGeneration } from './repo/generations';
import { getSettings } from './repo/providers';

/**
 * 採用した本文から次話用の要約を作る（機能仕様 §15）。
 * 結果は「未保存の下書き」として残し、ユーザーが確認して保存するまで確定しない（§16）。
 */
export function startSummary(episodeId: string): void {
  const ep = getEpisode(episodeId);
  if (!ep) throw notFound('エピソード');
  if (!ep.acceptedGenerationId) throw new AppError(400, '先に本文を採用してください');
  const gen = getGeneration(ep.acceptedGenerationId);
  if (!gen?.content.trim()) throw new AppError(400, '採用した本文が空です');
  if (getTask('summary', episodeId)?.status === 'running') {
    throw new AppError(409, '要約を生成中です。終わるまでお待ちください。');
  }
  const { provider, model } = resolveModel('summary');
  const messages = buildSummaryMessages({
    episodeNumber: ep.episodeNumber,
    episodeTitle: ep.title,
    previousSummary: ep.previousSummary,
    text: gen.content,
  });
  const { maxTokens } = getSettings();

  runTask(
    'summary',
    episodeId,
    async (signal) => {
      const result = await textProvider(provider).generateText({
        model,
        messages,
        temperature: 0.3,
        maxTokens,
        signal,
      });
      const text = result.text.trim();
      if (!text) throw new LLMError('empty', { message: '要約が空でした。もう一度お試しください。' });
      saveSummaryDraft(episodeId, text, 'ai', gen.id);
    },
    describeError,
  );
}
