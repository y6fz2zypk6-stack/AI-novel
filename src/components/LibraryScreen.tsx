'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { api, errorMessage, formatNumber } from '@/lib/client';
import type { ImageView } from '@/lib/types';
import { Header, Main, Page } from './chrome';
import { StillViewer } from './StillViewer';
import { Badge, Button, EmptyState, ErrorBanner, LinkButton, cx } from './ui';

export type LibraryTab = 'characters' | 'lore' | 'episodes' | 'stills';

type Entry = { id: string; name: string; chars: number; excerpt: string };
type EpisodeItem = {
  id: string;
  episodeNumber: number;
  title: string;
  accepted: boolean;
  summarySaved: boolean;
  generationCount: number;
  imageCount: number;
};
type Still = ImageView & { episodeNumber: number; episodeTitle: string };

const TAB_LABEL: Record<LibraryTab, string> = { characters: '人物', lore: 'ロア', episodes: '話', stills: 'スチル' };

/** Library（デザイン仕様 §5.6） */
export function LibraryScreen({
  world,
  tab,
  characters,
  lore,
  episodes,
  images,
}: {
  world: { id: string; name: string };
  tab: LibraryTab;
  characters: Entry[];
  lore: Entry[];
  episodes: EpisodeItem[];
  images: Still[];
}) {
  const router = useRouter();
  const [stills, setStills] = useState(images);
  const [viewing, setViewing] = useState<Still | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function newEpisode() {
    setCreating(true);
    try {
      const res = await api<{ episode: { id: string } }>(`/api/worlds/${world.id}/episodes`, { body: {} });
      router.push(`/w/${world.id}/write?ep=${res.episode.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setCreating(false);
    }
  }

  const addHref =
    tab === 'characters' ? `/w/${world.id}/characters/new` : tab === 'lore' ? `/w/${world.id}/lore/new` : null;

  return (
    <Page>
      <Header
        world={world}
        title="Library"
        right={
          addHref ? (
            <LinkButton href={addHref} variant="primary" size="sm" className="px-3">
              <Plus size={17} aria-hidden />
              追加
            </LinkButton>
          ) : tab === 'episodes' ? (
            <Button variant="primary" size="sm" className="px-3" onClick={newEpisode} busy={creating}>
              <Plus size={17} aria-hidden />
              新しい話
            </Button>
          ) : undefined
        }
      />
      <Main className="flex flex-col gap-4">
        <div role="tablist" aria-label="Library の種類" className="grid grid-cols-4 rounded-[12px] bg-surface-tab p-1">
          {(Object.keys(TAB_LABEL) as LibraryTab[]).map((key) => (
            <Link
              key={key}
              role="tab"
              aria-selected={key === tab}
              href={`/w/${world.id}/library?tab=${key}`}
              replace
              scroll={false}
              className={cx(
                'flex h-10 items-center justify-center rounded-[9px] text-[14px]',
                key === tab ? 'bg-bg font-bold text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]' : 'text-ink-muted',
              )}
            >
              {TAB_LABEL[key]}
            </Link>
          ))}
        </div>

        {error && <ErrorBanner message={error} />}

        {(tab === 'characters' || tab === 'lore') && (
          <EntryList
            entries={tab === 'characters' ? characters : lore}
            hrefOf={(id) => `/w/${world.id}/${tab === 'characters' ? 'characters' : 'lore'}/${id}`}
            empty={
              <EmptyState
                text={tab === 'characters' ? 'まだ人物がいません' : 'まだロアがありません'}
                action={
                  <LinkButton href={addHref!} variant="primary">
                    <Plus size={17} aria-hidden />
                    {tab === 'characters' ? '人物を追加' : 'ロアを追加'}
                  </LinkButton>
                }
              />
            }
          />
        )}

        {tab === 'episodes' &&
          (episodes.length === 0 ? (
            <EmptyState
              text="まだ話がありません"
              action={
                <Button variant="primary" onClick={newEpisode} busy={creating}>
                  <Plus size={17} aria-hidden />
                  最初の話を書く
                </Button>
              }
            />
          ) : (
            <ul className="flex flex-col gap-2.5">
              {episodes.map((e) => (
                <li key={e.id}>
                  <Link
                    href={e.generationCount > 0 ? `/w/${world.id}/episodes/${e.id}` : `/w/${world.id}/write?ep=${e.id}`}
                    className="block rounded-card border border-line bg-surface px-4 py-3.5"
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="flex-none text-[13px] font-bold text-ink-muted tabular-nums">Ep.{e.episodeNumber}</span>
                      <span className="min-w-0 flex-1 truncate font-prose text-[16px] font-semibold">
                        {e.title || '（無題）'}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Badge tone={e.accepted ? 'accent' : 'neutral'}>{e.accepted ? '採用済み' : '未採用'}</Badge>
                      {e.accepted && <Badge>{e.summarySaved ? '要約 保存済み' : '要約 未保存'}</Badge>}
                      <span className="text-[12px] text-ink-muted">
                        候補 {e.generationCount}
                        {e.imageCount > 0 && ` · スチル ${e.imageCount}`}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ))}

        {tab === 'stills' &&
          (stills.length === 0 ? (
            <EmptyState text="まだスチルがありません。本文を採用した話の画面から生成できます。" />
          ) : (
            <ul className="grid grid-cols-2 gap-2.5">
              {stills.map((img) => (
                <li key={img.id}>
                  <button
                    type="button"
                    onClick={() => setViewing(img)}
                    className="block aspect-[3/4] w-full overflow-hidden rounded-[12px] border border-line bg-surface"
                    aria-label={`Ep.${img.episodeNumber} のスチルを拡大`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.thumbUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                  </button>
                  <p className="mt-1 truncate text-[12px] text-ink-muted">
                    Ep.{img.episodeNumber} {img.episodeTitle}
                  </p>
                </li>
              ))}
            </ul>
          ))}
      </Main>

      <StillViewer
        image={viewing}
        onClose={() => setViewing(null)}
        onDeleted={(id) => {
          setStills((list) => list.filter((i) => i.id !== id));
          setViewing(null);
        }}
        episodeLink={
          viewing ? { href: `/w/${world.id}/episodes/${viewing.episodeId}`, label: `Ep.${viewing.episodeNumber} を開く` } : undefined
        }
      />
    </Page>
  );
}

function EntryList({
  entries,
  hrefOf,
  empty,
}: {
  entries: Entry[];
  hrefOf: (id: string) => string;
  empty: React.ReactNode;
}) {
  if (entries.length === 0) return <>{empty}</>;
  return (
    <ul className="flex flex-col gap-2.5">
      {entries.map((e) => (
        <li key={e.id}>
          <Link href={hrefOf(e.id)} className="block rounded-card border border-line bg-surface px-4 py-3.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-[15px] font-bold">{e.name}</span>
              <span className="flex-none text-[12px] text-ink-muted tabular-nums">{formatNumber(e.chars)}字</span>
            </div>
            {e.excerpt.trim() && (
              <p className="mt-1 line-clamp-2 whitespace-pre-line text-[13px] leading-[1.6] text-ink-sub">{e.excerpt}</p>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
