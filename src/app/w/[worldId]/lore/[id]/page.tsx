import { notFound } from 'next/navigation';
import { EntryForm } from '@/components/EntryForm';
import { getLore, getWorld } from '@/lib/server/repo/worlds';

export const metadata = { title: 'ロアを編集' };

type Props = { params: Promise<{ worldId: string; id: string }>; searchParams: Promise<{ from?: string }> };

export default async function EditLorePage({ params, searchParams }: Props) {
  const { worldId, id } = await params;
  const world = getWorld(worldId);
  const entry = getLore(id);
  if (!world || !entry || entry.worldId !== worldId) notFound();
  return (
    <EntryForm
      kind="lore"
      world={{ id: world.id, name: world.name }}
      entry={{ id: entry.id, name: entry.title, content: entry.content }}
      from={(await searchParams).from}
    />
  );
}
