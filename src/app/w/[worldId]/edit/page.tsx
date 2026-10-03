import { notFound } from 'next/navigation';
import { WorldForm } from '@/components/WorldForm';
import { getWorld } from '@/lib/server/repo/worlds';

export const metadata = { title: 'World を編集' };

export default async function EditWorldPage({ params }: { params: Promise<{ worldId: string }> }) {
  const world = getWorld((await params).worldId);
  if (!world) notFound();
  return (
    <WorldForm
      world={{
        id: world.id,
        name: world.name,
        description: world.description,
        baseInstruction: world.baseInstruction,
      }}
    />
  );
}
