import { notFound } from 'next/navigation';
import { ProviderForm } from '@/components/ProviderForm';
import { getProvider, toProviderView } from '@/lib/server/repo/providers';

export const metadata = { title: 'Provider' };

/** /settings/providers/new で新規作成 */
export default async function ProviderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id === 'new') return <ProviderForm />;
  const row = getProvider(id);
  if (!row) notFound();
  return <ProviderForm provider={toProviderView(row)} />;
}
