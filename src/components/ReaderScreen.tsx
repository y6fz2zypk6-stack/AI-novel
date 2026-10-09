'use client';

import Link from 'next/link';
import { PenLine, TableOfContents } from 'lucide-react';
import { useState } from 'react';
import { formatNumber } from '@/lib/client';
import { episodeOrdinal } from '@/lib/episodes';
import { countChars } from '@/lib/tokens';
import type { EpisodeKind } from '@/lib/types';
import { Header, Main, Page } from './chrome';
import { EditSheet } from './EditSheet';
import { Prose } from './Prose';
import { Sheet } from './Sheet';
import { EmptyState, IconButton, LinkButton, cx } from './ui';

type ReaderEpisode = {
  id: string;
  episodeNumber: number;
  baseNumber: number | null;
  title: string;
  generationId: string;
  content: string;
  edited: boolean;
};

/** 採用した本文だけを、話の順に通して読む画面 */
export function ReaderScreen({
  world,
  kind,
  counts,
  episodes: initialEpisodes,
}: {
  world: { id: string; name: string };
  kind: EpisodeKind;
  /** 採用済みの話の数（本編・番外編の切り替えに出す） */
  counts: Record<EpisodeKind, number>;
  episodes: ReaderEpisode[];
}) {
  const [episodes, setEpisodes] = useState(initialEpisodes);
  const [toc, setToc] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = episodes.find((e) => e.id === editingId) ?? null;
  const totalChars = episodes.reduce((sum, e) => sum + countChars(e.content), 0);

  function jump(id: string) {
    setToc(false);
    // シートが閉じて背面のスクロール固定が外れてから移動する
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        document.getElementById(`ep-${id}`)?.scrollIntoView({ block: 'start' });
        window.history.replaceState(null, '', `#ep-${id}`);
      }),
    );
  }

  return (
    <Page>
      <Header
        world={world}
        back={`/w/${world.id}/library?tab=episodes`}
        title="通して読む"
        subtitle={
          episodes.length > 0 ? (
            <p className="text-[13px] text-ink-muted tabular-nums">
              {kind === 'side' ? '番外編' : '本編'} · {episodes.length}話 · {formatNumber(totalChars)}字
            </p>
          ) : undefined
        }
        right={
          episodes.length > 0 ? (
            <IconButton label="目次" onClick={() => setToc(true)}>
              <TableOfContents size={20} aria-hidden />
            </IconButton>
          ) : undefined
        }
      />
      <Main className="flex flex-col gap-8">
        {(counts.side > 0 || kind === 'side') && (
          <div role="tablist" aria-label="読む話の種類" className="grid grid-cols-2 rounded-[12px] bg-surface-tab p-1">
            {(['main', 'side'] as const).map((k) => (
              <Link
                key={k}
                role="tab"
                aria-selected={k === kind}
                href={`/w/${world.id}/read${k === 'side' ? '?kind=side' : ''}`}
                replace
                className={cx(
                  'flex h-10 items-center justify-center gap-1.5 rounded-[9px] text-[14px]',
                  k === kind ? 'bg-bg font-bold text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]' : 'text-ink-muted',
                )}
              >
                {k === 'main' ? '本編' : '番外編'}
                <span className="text-[12px] font-normal tabular-nums">{counts[k]}</span>
              </Link>
            ))}
          </div>
        )}

        {episodes.length === 0 ? (
          <EmptyState
            text={kind === 'side' ? 'まだ採用した番外編がありません' : 'まだ採用した本文がありません'}
            action={
              <LinkButton href={`/w/${world.id}/library?tab=episodes`} variant="secondary">
                話の一覧へ
              </LinkButton>
            }
          />
        ) : (
          episodes.map((e, i) => (
            <article
              key={e.id}
              id={`ep-${e.id}`}
              aria-labelledby={`ep-title-${e.id}`}
              className={cx('scroll-mt-4', i > 0 && 'border-t border-line pt-8')}
            >
              <header className="mb-5 flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold text-ink-muted">
                    {episodeOrdinal(kind, e.episodeNumber)}
                    {e.baseNumber !== null && <span className="font-normal"> · Ep.{e.baseNumber} 時点</span>}
                  </p>
                  <h2 id={`ep-title-${e.id}`} className="mt-0.5 font-prose text-[21px] font-semibold leading-[1.4]">
                    {e.title || '（無題）'}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingId(e.id)}
                  aria-describedby={`ep-title-${e.id}`}
                  className="-mr-2 inline-flex h-10 flex-none items-center gap-1 px-2 text-[13px] font-medium text-accent-ink"
                >
                  <PenLine size={15} aria-hidden />
                  手で直す
                </button>
              </header>
              <Prose text={e.content} className="px-2" />
            </article>
          ))
        )}
      </Main>

      <Sheet open={toc} onClose={() => setToc(false)} title="目次">
        <ol>
          {episodes.map((e) => (
            <li key={e.id} className="border-b border-line last:border-b-0">
              <button
                type="button"
                onClick={() => jump(e.id)}
                className="flex min-h-12 w-full items-baseline gap-3 py-3 text-left"
              >
                <span className="flex-none text-[13px] font-bold text-ink-muted tabular-nums">
                  {episodeOrdinal(kind, e.episodeNumber)}
                </span>
                <span className="min-w-0 flex-1 truncate font-prose text-[16px]">{e.title || '（無題）'}</span>
                <span className="flex-none text-[12px] text-ink-muted tabular-nums">
                  {formatNumber(countChars(e.content))}字
                </span>
              </button>
            </li>
          ))}
        </ol>
      </Sheet>

      {editing && (
        <EditSheet
          open
          onClose={() => setEditingId(null)}
          title={`${episodeOrdinal(kind, editing.episodeNumber)}を手で直す`}
          generation={{ id: editing.generationId, content: editing.content, edited: editing.edited }}
          onSaved={(v) => {
            setEpisodes((list) =>
              list.map((x) => (x.generationId === v.id ? { ...x, content: v.content, edited: v.edited } : x)),
            );
            setEditingId(null);
          }}
        />
      )}
    </Page>
  );
}
