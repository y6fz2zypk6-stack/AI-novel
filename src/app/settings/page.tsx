import { SettingsScreen } from '@/components/SettingsScreen';
import { defaultChoice } from '@/lib/server/models';
import { getSettings, listProviders, toProviderView } from '@/lib/server/repo/providers';

export const metadata = { title: 'Settings' };

export default function SettingsPage() {
  return (
    <SettingsScreen
      providers={listProviders().map(toProviderView)}
      settings={getSettings()}
      defaults={{
        writing: defaultChoice('writing'),
        summary: defaultChoice('summary'),
        image: defaultChoice('image'),
      }}
      version={`v${process.env.NEXT_PUBLIC_APP_VERSION ?? ''} · build ${(process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev').split('-').pop()}`}
    />
  );
}
