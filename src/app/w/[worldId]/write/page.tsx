import { notFound, redirect } from 'next/navigation';
import { WriteScreen } from '@/components/WriteScreen';
import { runningGenerationFor } from '@/lib/server/jobs';
import { defaultChoice } from '@/lib/server/models';
import {
  createEpisode,
  getEpisode,
  latestMainEpisode,
  latestSummarizedMainEpisode,
  previousMainEpisode,
} from '@/lib/server/repo/episodes';
import { countGenerations } from '@/lib/server/repo/generations';
import { listProviders, toProviderView } from '@/lib/server/repo/providers';
import { getWorld, listCharacters, listLore } from '@/lib/server/repo/worlds';

export const metadata = { title: 'Write' };

type Props = {
  params: Promise<{ worldId: string }>;
  searchParams: Promise<{ ep?: string }>;
};

/**
 * Write — 生成前の画面。
 * ?ep= が無いとき（Write タブ）は本編の最新話を開く。最新話に候補が既にあれば、
 * 続きから再開できるよう候補確認・採用後の画面へ移る。
 */
export default async function WritePage({ params, searchParams }: Props) {
  const { worldId } = await params;
  const { ep } = await searchParams;
  const world = getWorld(worldId);
  if (!world) notFound();

  let episodeId = ep;
  if (!episodeId) {
    const latest = latestMainEpisode(worldId)?.id ?? createEpisode(worldId).id;
    if (countGenerations(latest) > 0) redirect(`/w/${worldId}/episodes/${latest}`);
    episodeId = latest;
  }
  const episode = getEpisode(episodeId);
  if (!episode || episode.worldId !== worldId) notFound();

  // 「前回までの要約」の出どころ。本編は1つ前の話、番外編は土台にした本編の話
  const prev =
    episode.kind === 'side'
      ? episode.baseEpisodeId
        ? getEpisode(episode.baseEpisodeId)
        : latestSummarizedMainEpisode(worldId)
      : previousMainEpisode(worldId, episode.episodeNumber);
  return (
    <WriteScreen
      key={episode.id}
      world={{ id: world.id, name: world.name, baseInstruction: world.baseInstruction }}
      episode={{
        id: episode.id,
        kind: episode.kind,
        episodeNumber: episode.episodeNumber,
        title: episode.title,
        instruction: episode.instruction,
        previousSummary: episode.previousSummary,
        characterIds: episode.characterIds,
        loreIds: episode.loreIds,
        writingProviderId: episode.writingProviderId,
        writingModel: episode.writingModel,
        accepted: Boolean(episode.acceptedGenerationId),
      }}
      characters={listCharacters(worldId).map((c) => ({ id: c.id, name: c.name, content: c.content }))}
      lore={listLore(worldId).map((l) => ({ id: l.id, title: l.title, content: l.content }))}
      prevEpisode={prev ? { number: prev.episodeNumber, summary: prev.summary } : null}
      generationCount={countGenerations(episode.id)}
      runningGenerationId={runningGenerationFor(episode.id)?.generationId ?? null}
      writingDefault={defaultChoice('writing')}
      providers={listProviders().map(toProviderView)}
    />
  );
}
