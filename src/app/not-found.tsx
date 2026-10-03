import Link from 'next/link';
import { Page } from '@/components/chrome';
import { buttonClass } from '@/components/styles';

export default function NotFound() {
  return (
    <Page className="px-4 pt-[calc(env(safe-area-inset-top)+48px)]">
      <h1 className="text-[22px] font-bold">見つかりません</h1>
      <p className="mt-2 text-[14px] text-ink-muted">削除されたか、URL が間違っている可能性があります。</p>
      <Link href="/" className={buttonClass('primary', 'md', 'mt-6')}>
        Worlds へ戻る
      </Link>
    </Page>
  );
}
