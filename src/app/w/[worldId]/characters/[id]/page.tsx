import { notFound } from 'next/navigation';
import { EntryForm } from '@/components/EntryForm';
import { getCharacter, getWorld } from '@/lib/server/repo/worlds';

export const metadata = { title: '人物を編集' };

type Props = { params: Promise<{ worldId: string; id: string }>; searchParams: Promise<{ from?: string }> };

export default async function EditCharacterPage({ params, searchParams }: Props) {
  const { worldId, id } = await params;
  const world = getWorld(worldId);
  const entry = getCharacter(id);
  if (!world || !entry || entry.worldId !== worldId) notFound();
  return (
    <EntryForm
      kind="character"
      world={{ id: world.id, name: world.name }}
      entry={{ id: entry.id, name: entry.name, content: entry.content }}
      from={(await searchParams).from}
    />
  );
}
