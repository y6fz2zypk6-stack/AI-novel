import { notFound } from 'next/navigation';
import { EpisodeScreen } from '@/components/EpisodeScreen';
import { settleStaleGeneration } from '@/lib/server/generation';
import { taskState } from '@/lib/server/jobs';
import { defaultChoice } from '@/lib/server/models';
import { getEpisode, nextMainEpisode } from '@/lib/server/repo/episodes';
import { listGenerations, toGenerationView } from '@/lib/server/repo/generations';
import { listEpisodeImages, toImageView } from '@/lib/server/repo/images';
import { listProviders, toProviderView } from '@/lib/server/repo/providers';
import { getWorld } from '@/lib/server/repo/worlds';

export const metadata = { title: '候補' };

type Props = {
  params: Promise<{ worldId: string; episodeId: string }>;
  searchParams: Promise<{ view?: string; g?: string }>;
};

/** 候補確認 / 採用後（状態で切り替える。?view=candidates で候補確認を開く） */
export default async function EpisodePage({ params, searchParams }: Props) {
  const { worldId, episodeId } = await params;
  const { view, g } = await searchParams;
  const world = getWorld(worldId);
  const episode = getEpisode(episodeId);
  if (!world || !episode || episode.worldId !== worldId) notFound();

  const generations = listGenerations(episodeId).map((row) => toGenerationView(settleStaleGeneration(row)));
  const initialView = view !== 'candidates' && episode.acceptedGenerationId ? 'adopted' : 'candidates';

  return (
    <EpisodeScreen
      key={episode.id}
      world={{ id: world.id, name: world.name }}
      episode={{
        id: episode.id,
        kind: episode.kind,
        episodeNumber: episode.episodeNumber,
        title: episode.title,
        acceptedGenerationId: episode.acceptedGenerationId,
      }}
      generations={generations}
      initialView={initialView}
      initialGenerationId={g ?? null}
      summary={{
        summary: episode.summary,
        draft: episode.summaryDraft,
        draftSource: episode.summaryDraftSource,
        summaryGenerationId: episode.summaryGenerationId,
        acceptedGenerationId: episode.acceptedGenerationId,
        job: taskState('summary', episodeId),
      }}
      images={listEpisodeImages(episodeId).map(toImageView)}
      imageJob={taskState('image', episodeId)}
      providers={listProviders().map(toProviderView)}
      imageDefault={defaultChoice('image')}
      nextEpisodeId={episode.kind === 'main' ? (nextMainEpisode(worldId, episode.episodeNumber)?.id ?? null) : null}
    />
  );
}
