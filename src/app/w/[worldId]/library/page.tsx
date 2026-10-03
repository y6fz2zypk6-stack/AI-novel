import { notFound } from 'next/navigation';
import { LibraryScreen, type LibraryTab } from '@/components/LibraryScreen';
import { listEpisodes } from '@/lib/server/repo/episodes';
import { listWorldImages, toImageView } from '@/lib/server/repo/images';
import { getWorld, listCharacters, listLore } from '@/lib/server/repo/worlds';
import { countChars } from '@/lib/tokens';

export const metadata = { title: 'Library' };

const TABS: LibraryTab[] = ['characters', 'lore', 'episodes', 'stills'];

type Props = {
  params: Promise<{ worldId: string }>;
  searchParams: Promise<{ tab?: string }>;
};

export default async function LibraryPage({ params, searchParams }: Props) {
  const { worldId } = await params;
  const { tab: rawTab } = await searchParams;
  const world = getWorld(worldId);
  if (!world) notFound();
  const tab = TABS.includes(rawTab as LibraryTab) ? (rawTab as LibraryTab) : 'characters';

  const excerpt = (text: string) => text.slice(0, 200);
  return (
    <LibraryScreen
      world={{ id: world.id, name: world.name }}
      tab={tab}
      characters={listCharacters(worldId).map((c) => ({
        id: c.id,
        name: c.name,
        chars: countChars(c.content),
        excerpt: excerpt(c.content),
      }))}
      lore={listLore(worldId).map((l) => ({
        id: l.id,
        name: l.title,
        chars: countChars(l.content),
        excerpt: excerpt(l.content),
      }))}
      episodes={listEpisodes(worldId).map((e) => ({
        id: e.id,
        episodeNumber: e.episodeNumber,
        title: e.title,
        accepted: Boolean(e.acceptedGenerationId),
        summarySaved: Boolean(e.summary.trim()),
        generationCount: e.generationCount,
        imageCount: e.imageCount,
      }))}
      images={listWorldImages(worldId).map((img) => ({
        ...toImageView(img),
        episodeNumber: img.episodeNumber,
        episodeTitle: img.episodeTitle,
      }))}
    />
  );
}
