'use client';

import { Page } from '@/components/chrome';
import { Button } from '@/components/ui';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Page className="px-4 pt-[calc(env(safe-area-inset-top)+48px)]">
      <h1 className="text-[22px] font-bold">エラーが発生しました</h1>
      <p className="mt-2 text-[14px] text-ink-muted">{error.message || '画面を表示できませんでした。'}</p>
      <Button variant="primary" className="mt-6" onClick={reset}>
        再読み込み
      </Button>
    </Page>
  );
}
