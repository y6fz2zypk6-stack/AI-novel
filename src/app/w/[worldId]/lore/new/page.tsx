import { notFound } from 'next/navigation';
import { EntryForm } from '@/components/EntryForm';
import { getWorld } from '@/lib/server/repo/worlds';

export const metadata = { title: 'ロアを追加' };

type Props = { params: Promise<{ worldId: string }>; searchParams: Promise<{ from?: string }> };

export default async function NewLorePage({ params, searchParams }: Props) {
  const world = getWorld((await params).worldId);
  if (!world) notFound();
  return <EntryForm kind="lore" world={{ id: world.id, name: world.name }} from={(await searchParams).from} />;
}
