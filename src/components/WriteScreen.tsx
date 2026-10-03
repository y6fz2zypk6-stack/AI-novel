'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, History, PenLine, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, errorMessage, formatNumber, shortModel } from '@/lib/client';
import { buildContext } from '@/lib/prompt';
import type { ModelChoice, ProviderView } from '@/lib/types';
import { ContextSheet } from './ContextSheet';
import { Dock, Header, Main, Page } from './chrome';
import { ModelSheet } from './ModelSheet';
import { Sheet } from './Sheet';
import {
  Button,
  Card,
  Chip,
  ErrorBanner,
  IconLink,
  Input,
  Label,
  LinkButton,
  SectionHeading,
  TextArea,
  buttonClass,
  cx,
} from './ui';

export type WriteProps = {
  world: { id: string; name: string; baseInstruction: string };
  episode: {
    id: string;
    episodeNumber: number;
    title: string;
    instruction: string;
    previousSummary: string;
    characterIds: string[];
    loreIds: string[];
    writingProviderId: string | null;
    writingModel: string | null;
    accepted: boolean;
  };
  characters: { id: string; name: string; content: string }[];
  lore: { id: string; title: string; content: string }[];
  prevEpisode: { number: number; summary: string } | null;
  generationCount: number;
  runningGenerationId: string | null;
  writingDefault: ModelChoice | null;
  providers: ProviderView[];
};

type Draft = {
  title: string;
  instruction: string;
  previousSummary: string;
  characterIds: string[];
  loreIds: string[];
  writingProviderId: string | null;
  writingModel: string | null;
};

type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

/** 入力内容を数秒ごとに下書きとして保存する（デザイン仕様 §5.2） */
function useAutosave(episodeId: string, draft: Draft) {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const lastSaved = useRef(JSON.stringify(draft));
  const pending = useRef<Draft | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(
    async (keepalive = false): Promise<boolean> => {
      if (timer.current) clearTimeout(timer.current);
      const d = pending.current;
      if (!d) return true;
      pending.current = null;
      setStatus('saving');
      try {
        await api(`/api/episodes/${episodeId}`, { method: 'PATCH', body: d, keepalive });
        lastSaved.current = JSON.stringify(d);
        setStatus(pending.current ? 'pending' : 'saved');
        return true;
      } catch {
        pending.current ??= d;
        setStatus('error');
        return false;
      }
    },
    [episodeId],
  );

  const json = JSON.stringify(draft);
  useEffect(() => {
    if (json === lastSaved.current) return;
    pending.current = JSON.parse(json) as Draft;
    setStatus('pending');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 1500);
  }, [json, flush]);

  // 画面を離れるとき（アプリ切替・画面遷移）にも保存する
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush(true);
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
      void flush(true);
    };
  }, [flush]);

  return { status, flush };
}

const COLLAPSE_AT = 12;

function ChipGroup<T extends { id: string }>({
  labelId,
  items,
  selected,
  labelOf,
  onToggle,
}: {
  labelId: string;
  items: T[];
  selected: string[];
  labelOf: (item: T) => string;
  onToggle: (id: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const collapsed = !showAll && items.length > COLLAPSE_AT;
  // 折りたたみ中でも、選択済みのものは隠さない
  const visible = collapsed
    ? items.filter((it, i) => i < COLLAPSE_AT || selected.includes(it.id))
    : items;
  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-2">
      {visible.map((it) => (
        <Chip key={it.id} pressed={selected.includes(it.id)} onClick={() => onToggle(it.id)}>
          {labelOf(it)}
        </Chip>
      ))}
      {items.length > COLLAPSE_AT && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="inline-flex h-10 items-center gap-1 px-2 text-[14px] text-accent-ink"
          aria-expanded={showAll}
        >
          {showAll ? '折りたたむ' : `すべて表示（${items.length}）`}
          <ChevronDown size={15} aria-hidden className={cx(showAll && 'rotate-180')} />
        </button>
      )}
    </div>
  );
}

/** 2行の抜粋用に、Markdown の見出し記号や箇条書きの記号を外す */
function plainPreview(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*#{1,6}\s*/, '').replace(/^\s*[-*・]\s*/, '').trim())
    .filter(Boolean)
    .join(' / ');
}

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

/** Write — 生成前のメイン画面（デザイン仕様 §5.2） */
export function WriteScreen(props: WriteProps) {
  const { world, episode, characters, lore, prevEpisode, providers, writingDefault } = props;
  const router = useRouter();

  const [title, setTitle] = useState(episode.title);
  const [instruction, setInstruction] = useState(episode.instruction);
  const [previousSummary, setPreviousSummary] = useState(episode.previousSummary);
  const [characterIds, setCharacterIds] = useState(episode.characterIds);
  const [loreIds, setLoreIds] = useState(episode.loreIds);
  const [model, setModel] = useState<{ providerId: string; model: string } | null>(
    episode.writingProviderId && episode.writingModel
      ? { providerId: episode.writingProviderId, model: episode.writingModel }
      : null,
  );

  const draft: Draft = {
    title,
    instruction,
    previousSummary,
    characterIds,
    loreIds,
    writingProviderId: model?.providerId ?? null,
    writingModel: model?.model ?? null,
  };
  const { status, flush } = useAutosave(episode.id, draft);

  const [sheet, setSheet] = useState<'context' | 'model' | 'summary' | null>(null);
  const [summaryEdit, setSummaryEdit] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const built = useMemo(
    () =>
      buildContext({
        worldInstruction: world.baseInstruction,
        // 一覧と同じ並び（作成順）で渡す。サーバー側の組み立てと同じ順序になる
        characters: characters.filter((c) => characterIds.includes(c.id)),
        lore: lore.filter((l) => loreIds.includes(l.id)),
        previousSummary,
        episodeNumber: episode.episodeNumber,
        episodeTitle: title,
        episodeInstruction: instruction,
      }),
    [world.baseInstruction, characters, lore, characterIds, loreIds, previousSummary, episode.episodeNumber, title, instruction],
  );

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      if (!(await flush())) throw new Error('下書きを保存できませんでした。通信状況を確認してください。');
      const res = await api<{ generationId: string }>(`/api/episodes/${episode.id}/generate`, { body: {} });
      router.push(`/w/${world.id}/episodes/${episode.id}?view=candidates&g=${res.generationId}`);
    } catch (err) {
      setError(errorMessage(err));
      setGenerating(false);
    }
  }

  async function removeEpisode() {
    if (!confirm(`Episode ${episode.episodeNumber} を削除しますか？\n候補・要約・スチルも削除され、元に戻せません。`)) return;
    try {
      await api(`/api/episodes/${episode.id}`, { method: 'DELETE' });
      router.push(`/w/${world.id}/write`);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const modelLabel = model ? shortModel(model.model) : '既定（執筆）';
  const statusText: Record<SaveStatus, string> = {
    idle: '',
    pending: '下書きを保存します…',
    saving: '下書きを保存中…',
    saved: '下書きを保存しました',
    error: '下書きを保存できませんでした（自動で再試行します）',
  };

  return (
    <Page>
      <Header
        world={world}
        title={`Episode ${episode.episodeNumber}`}
        right={
          props.generationCount > 0 ? (
            <IconLink
              href={`/w/${world.id}/episodes/${episode.id}?view=candidates`}
              label={`生成履歴（${props.generationCount}件）`}
            >
              <History size={20} aria-hidden />
            </IconLink>
          ) : undefined
        }
      />
      <Main className="flex flex-col gap-[22px]">
        {props.runningGenerationId && (
          <div className="flex items-center justify-between gap-3 rounded-[14px] border border-accent-banner-line bg-accent-banner px-3.5 py-3 text-[14px] text-accent-ink">
            <span>生成中の候補があります</span>
            <Link
              href={`/w/${world.id}/episodes/${episode.id}?view=candidates&g=${props.runningGenerationId}`}
              className="font-bold underline-offset-2 hover:underline"
            >
              見る
            </Link>
          </div>
        )}
        {episode.accepted && !props.runningGenerationId && (
          <div className="flex items-center justify-between gap-3 rounded-[14px] border border-accent-banner-line bg-accent-banner px-3.5 py-3 text-[14px] text-accent-ink">
            <span>この話は本文を採用済みです</span>
            <Link href={`/w/${world.id}/episodes/${episode.id}`} className="font-bold underline-offset-2 hover:underline">
              採用後の画面へ
            </Link>
          </div>
        )}
        {error && <ErrorBanner message={error} onRetry={generate} />}

        <div className="flex items-end gap-2.5">
          <div className="min-w-0 flex-1">
            <Label htmlFor="ep-title">タイトル</Label>
            <Input
              id="ep-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例：雨の屋上"
              maxLength={200}
              autoComplete="off"
            />
          </div>
          <div className="w-[132px] flex-none">
            <span className="mb-1.5 block text-[13px] font-medium text-ink-muted" id="ep-model-label">
              モデル
            </span>
            <button
              type="button"
              aria-labelledby="ep-model-label"
              aria-describedby="ep-model-value"
              onClick={() => setSheet('model')}
              className={cx(
                'flex h-11 w-full items-center gap-1 rounded-field border px-3 text-left text-[14px]',
                model ? 'border-accent bg-accent-soft text-accent-strong' : 'border-line bg-surface text-ink',
              )}
            >
              <span id="ep-model-value" className="min-w-0 flex-1 truncate">
                {modelLabel}
              </span>
              <ChevronDown size={16} aria-hidden className="flex-none text-ink-muted" />
            </button>
          </div>
        </div>

        <section aria-labelledby="sec-chars">
          <SectionHeading
            id="sec-chars"
            right={
              characters.length > 0 && (
                <span className="text-[13px] text-ink-muted">
                  {characterIds.length} / {characters.length} 選択
                </span>
              )
            }
          >
            登場人物
          </SectionHeading>
          {characters.length === 0 ? (
            <p className="flex items-center gap-3 text-[14px] text-ink-muted">
              まだ人物がいません
              <Link
                href={`/w/${world.id}/characters/new?from=write`}
                className="inline-flex h-10 items-center gap-1 font-medium text-accent-ink"
              >
                <Plus size={16} aria-hidden />
                人物を追加
              </Link>
            </p>
          ) : (
            <ChipGroup
              labelId="sec-chars"
              items={characters}
              selected={characterIds}
              labelOf={(c) => c.name}
              onToggle={(id) => setCharacterIds((v) => toggle(v, id))}
            />
          )}
        </section>

        <section aria-labelledby="sec-lore">
          <SectionHeading
            id="sec-lore"
            right={
              lore.length > 0 && (
                <span className="text-[13px] text-ink-muted">
                  {loreIds.length} / {lore.length} 選択
                </span>
              )
            }
          >
            ロア
          </SectionHeading>
          {lore.length === 0 ? (
            <p className="flex items-center gap-3 text-[14px] text-ink-muted">
              まだロアがありません
              <Link
                href={`/w/${world.id}/lore/new?from=write`}
                className="inline-flex h-10 items-center gap-1 font-medium text-accent-ink"
              >
                <Plus size={16} aria-hidden />
                ロアを追加
              </Link>
            </p>
          ) : (
            <ChipGroup
              labelId="sec-lore"
              items={lore}
              selected={loreIds}
              labelOf={(l) => l.title}
              onToggle={(id) => setLoreIds((v) => toggle(v, id))}
            />
          )}
        </section>

        <section aria-labelledby="sec-prev">
          <Card className="py-3.5">
            <div className="flex items-center justify-between gap-3">
              <h2 id="sec-prev" className="text-[15px] font-bold">
                前回までの要約{prevEpisode && <span className="font-normal text-ink-muted"> · Ep.{prevEpisode.number}</span>}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setSummaryEdit(previousSummary);
                  setSheet('summary');
                }}
                className="-mr-2 inline-flex h-10 items-center px-2 text-[14px] font-medium text-accent-ink"
              >
                編集
              </button>
            </div>
            <p className={cx('line-clamp-2 text-[14px] leading-[1.6]', previousSummary.trim() ? 'text-ink-sub' : 'text-ink-muted')}>
              {plainPreview(previousSummary) || (prevEpisode ? '前の話の要約が保存されていません' : 'なし（最初の話）')}
            </p>
          </Card>
        </section>

        <section>
          <Label htmlFor="ep-instruction" className="!text-[15px] !font-bold !text-ink">
            今回の指示
          </Label>
          <TextArea
            id="ep-instruction"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            minHeight={150}
            strong
            placeholder={'例：\n今回は放課後の屋上でミナとレンが会話する。\n最初は険悪だが、最後には少しだけ互いへの警戒が薄れる。'}
          />
          <p className="mt-1.5 min-h-[18px] text-[12px] text-ink-muted" aria-live="polite">
            {statusText[status]}
          </p>
        </section>

        <div>
          <Button variant="danger" size="sm" onClick={removeEpisode} className="-ml-3.5">
            この話を削除
          </Button>
        </div>
      </Main>

      <Dock>
        <button
          type="button"
          onClick={() => setSheet('context')}
          className="flex h-14 w-[104px] flex-none flex-col items-start justify-center rounded-[12px] border border-line bg-surface px-3 text-left"
        >
          <span className="text-[11px] leading-none text-ink-muted">Context</span>
          <span className="mt-1 text-[14px] font-medium leading-none tabular-nums">
            約{formatNumber(built.totalTokens)} tok
          </span>
        </button>
        {props.runningGenerationId ? (
          <LinkButton
            href={`/w/${world.id}/episodes/${episode.id}?view=candidates&g=${props.runningGenerationId}`}
            variant="primary"
            size="lg"
            className="flex-1"
          >
            生成中の候補を見る
          </LinkButton>
        ) : (
          <button
            type="button"
            onClick={generate}
            disabled={generating}
            className={buttonClass('primary', 'lg', 'flex-1')}
            aria-busy={generating || undefined}
          >
            <PenLine size={19} aria-hidden />
            {generating ? '生成を開始中…' : '本文を生成'}
          </button>
        )}
      </Dock>

      <ContextSheet open={sheet === 'context'} onClose={() => setSheet(null)} title="Context Preview" built={built} />

      <ModelSheet
        open={sheet === 'model'}
        onClose={() => setSheet(null)}
        title="執筆モデル"
        kind="text"
        providers={providers}
        value={model}
        defaultChoice={writingDefault}
        defaultLabel="既定（執筆）を使う"
        onSelect={setModel}
      />

      <Sheet
        open={sheet === 'summary'}
        onClose={() => setSheet(null)}
        title={prevEpisode ? `前回までの要約 · Ep.${prevEpisode.number}` : '前回までの要約'}
        footer={
          <div className="flex gap-2.5">
            {prevEpisode && prevEpisode.summary !== summaryEdit && (
              <Button variant="secondary" size="lg" onClick={() => setSummaryEdit(prevEpisode.summary)}>
                Ep.{prevEpisode.number} の要約に戻す
              </Button>
            )}
            <Button
              variant="primary"
              size="lg"
              className="flex-1"
              onClick={() => {
                setPreviousSummary(summaryEdit);
                setSheet(null);
              }}
            >
              反映
            </Button>
          </div>
        }
      >
        <p className="mb-2 text-[12px] leading-[1.6] text-ink-muted">
          このエピソードの生成にだけ使います。前の話の要約そのものは変わりません。
        </p>
        <TextArea
          aria-label="前回までの要約"
          value={summaryEdit}
          onChange={(e) => setSummaryEdit(e.target.value)}
          minHeight={280}
          strong
        />
      </Sheet>
    </Page>
  );
}
