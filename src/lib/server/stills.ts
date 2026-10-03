import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { buildImagePromptMessages, cleanImagePrompt } from '@/lib/prompt';
import { AppError, notFound } from './http';
import { newId } from './ids';
import { getTask, runTask } from './jobs';
import { imageProvider, textProvider } from './llm/client';
import { LLMError, describeError } from './llm/errors';
import { resolveModel } from './models';
import { getEpisode } from './repo/episodes';
import { getGeneration } from './repo/generations';
import { insertImage } from './repo/images';
import { getSettings } from './repo/providers';
import { listCharacters, touchWorld } from './repo/worlds';
import { dataDir, imagesDir } from './paths';

const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/**
 * 採用本文からスチル画像を作る（機能仕様 §21）。
 * 1) LLM が本文から画像 Prompt を作る → 2) 画像モデルで生成 → 3) /data/images に保存
 */
export function startStill(
  episodeId: string,
  opts: { instruction: string; providerId?: string | null; model?: string | null },
): void {
  const ep = getEpisode(episodeId);
  if (!ep) throw notFound('エピソード');
  if (!ep.acceptedGenerationId) throw new AppError(400, '先に本文を採用してください');
  const gen = getGeneration(ep.acceptedGenerationId);
  if (!gen?.content.trim()) throw new AppError(400, '採用した本文が空です');
  if (getTask('image', episodeId)?.status === 'running') {
    throw new AppError(409, 'スチルを生成中です。終わるまでお待ちください。');
  }

  const image = resolveModel('image', { providerId: opts.providerId, model: opts.model });
  const writer = resolveModel('summary');
  const chars = listCharacters(ep.worldId).filter((c) => ep.characterIds.includes(c.id));
  const messages = buildImagePromptMessages({
    characters: chars,
    text: gen.content,
    instruction: opts.instruction,
  });
  const { maxTokens } = getSettings();

  runTask(
    'image',
    episodeId,
    async (signal) => {
      const promptResult = await textProvider(writer.provider).generateText({
        model: writer.model,
        messages,
        temperature: 0.7,
        maxTokens,
        signal,
      });
      const prompt = cleanImagePrompt(promptResult.text);
      if (!prompt) throw new LLMError('empty', { message: '画像 Prompt を作れませんでした。もう一度お試しください。' });

      const result = await imageProvider(image.provider).generateImage({
        model: image.model,
        prompt,
        aspectRatio: '3:4',
        signal,
      });

      const id = newId();
      fs.mkdirSync(imagesDir(), { recursive: true });
      const fileAbs = path.join(/*turbopackIgnore: true*/ imagesDir(), `${id}.${EXT[result.mime] ?? 'png'}`);
      fs.writeFileSync(fileAbs, result.data);
      let thumbRel: string | null = null;
      try {
        const thumbAbs = path.join(/*turbopackIgnore: true*/ imagesDir(), `${id}_thumb.webp`);
        await sharp(result.data).resize(336, 448, { fit: 'cover' }).webp({ quality: 80 }).toFile(thumbAbs);
        thumbRel = path.relative(dataDir(), thumbAbs);
      } catch (err) {
        console.warn('[still] thumbnail failed', err);
      }
      insertImage({
        id,
        episodeId,
        generationId: gen.id,
        provider: image.provider.name,
        model: image.model,
        prompt,
        instruction: opts.instruction,
        filePath: path.relative(dataDir(), fileAbs),
        thumbPath: thumbRel,
        mime: result.mime,
        createdAt: Date.now(),
      });
      touchWorld(ep.worldId);
    },
    (err) => `スチルの生成に失敗しました。${describeError(err)}`,
  );
}
