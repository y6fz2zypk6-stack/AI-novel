import { notFound } from 'next/navigation';
import { ReaderScreen } from '@/components/ReaderScreen';
import { countAdopted, listAdoptedTexts } from '@/lib/server/repo/episodes';
import { getWorld } from '@/lib/server/repo/worlds';

export const metadata = { title: '通して読む' };

type Props = {
  params: Promise<{ worldId: string }>;
  searchParams: Promise<{ kind?: string }>;
};

/** 採用した本文だけを、話の順に通して読む（?kind=side で番外編） */
export default async function ReadPage({ params, searchParams }: Props) {
  const { worldId } = await params;
  const { kind: rawKind } = await searchParams;
  const world = getWorld(worldId);
  if (!world) notFound();
  const kind = rawKind === 'side' ? 'side' : 'main';
  return (
    <ReaderScreen
      key={kind}
      world={{ id: world.id, name: world.name }}
      kind={kind}
      counts={countAdopted(worldId)}
      episodes={listAdoptedTexts(worldId, kind)}
    />
  );
}
