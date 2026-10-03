import Link from 'next/link';
import { cookies } from 'next/headers';
import { Pencil, Plus } from 'lucide-react';
import { Main, Page } from '@/components/chrome';
import { buttonClass, cx } from '@/components/styles';
import { formatDate } from '@/lib/client';
import { listWorlds } from '@/lib/server/repo/worlds';

export default async function WorldsPage() {
  const worlds = listWorlds();
  const current = (await cookies()).get('novel_world')?.value;

  return (
    <Page>
      <header className="px-4 pb-4 pt-[calc(env(safe-area-inset-top)+28px)]">
        <h1 className="font-prose text-[30px] font-semibold leading-[1.3] tracking-[0.04em]">Worlds</h1>
        <p className="mt-1 text-[14px] text-ink-muted">書く世界を選んでください</p>
      </header>
      <Main>
        {worlds.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-card border border-dashed border-line-strong px-4 py-10 text-center">
            <p className="text-[14px] text-ink-muted">まだ World がありません。最初の世界観を作りましょう。</p>
            <Link href="/worlds/new" className={buttonClass('primary', 'lg')}>
              <Plus size={18} aria-hidden />
              新しいWorld
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {worlds.map((w) => {
              const active = w.id === current;
              const meta = [
                w.latestEpisodeNumber ? `Ep.${w.latestEpisodeNumber}` : null,
                `人物 ${w.characterCount}`,
                `ロア ${w.loreCount}`,
                `最終更新 ${formatDate(w.lastActivityAt)}`,
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <li
                  key={w.id}
                  className={cx(
                    'relative rounded-card p-4',
                    active ? 'border-[1.5px] border-accent bg-bg' : 'border border-line bg-surface',
                  )}
                >
                  {active && (
                    <span className="mb-1.5 inline-flex h-6 items-center rounded-full bg-accent px-2.5 text-[12px] font-bold text-accent-on">
                      作業中
                    </span>
                  )}
                  <h2 className="pr-12 font-prose text-[21px] font-semibold leading-[1.4]">
                    <Link
                      href={`/w/${w.id}/write`}
                      className="after:absolute after:inset-0 after:rounded-card after:content-['']"
                    >
                      {w.name}
                    </Link>
                  </h2>
                  {w.description && (
                    <p className="mt-1 line-clamp-2 text-[14px] leading-[1.6] text-ink-sub">{w.description}</p>
                  )}
                  <p className="mt-2 text-[12px] text-ink-muted">{meta}</p>
                  <Link
                    href={`/w/${w.id}/edit`}
                    aria-label={`${w.name} を編集`}
                    className="absolute right-2.5 top-2.5 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full text-ink-muted hover:text-ink"
                  >
                    <Pencil size={18} aria-hidden />
                  </Link>
                </li>
              );
            })}
            <li>
              <Link
                href="/worlds/new"
                className="flex h-14 items-center justify-center gap-1.5 rounded-card border-[1.5px] border-dashed border-line-strong text-[15px] text-ink-sub"
              >
                <Plus size={18} aria-hidden />
                新しいWorld
              </Link>
            </li>
          </ul>
        )}
      </Main>
    </Page>
  );
}
