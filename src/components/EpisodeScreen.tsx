'use client';

import { useRouter } from 'next/navigation';
import {
  AlignLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  MessageSquareText,
  RotateCw,
  Square,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type TouchEvent } from 'react';
import { api, errorMessage, formatNumber, formatTime } from '@/lib/client';
import { contextFromSnapshot, type BuiltContext } from '@/lib/prompt';
import { countChars } from '@/lib/tokens';
import type {
  GenerationPoll,
  GenerationView,
  ImageView,
  JobState,
  ModelChoice,
  PromptSnapshot,
  ProviderView,
  SummaryState,
  Usage,
} from '@/lib/types';
import { ContextSheet } from './ContextSheet';
import { Dock, Header, Main, Page } from './chrome';
import { ModelSheet } from './ModelSheet';
import { Prose } from './Prose';
import { Sheet } from './Sheet';
import { StillViewer } from './StillViewer';
import {
  Badge,
  Button,
  DockButton,
  ErrorBanner,
  IconButton,
  Label,
  SavedMark,
  SectionHeading,
  Spinner,
  TextArea,
  cx,
} from './ui';

export type EpisodeProps = {
  world: { id: string; name: string };
  episode: { id: string; episodeNumber: number; title: string; acceptedGenerationId: string | null };
  generations: GenerationView[];
  initialView: 'candidates' | 'adopted';
  initialGenerationId: string | null;
  summary: SummaryState;
  images: ImageView[];
  imageJob: JobState | null;
  providers: ProviderView[];
  imageDefault: ModelChoice | null;
  nextEpisodeId: string | null;
};

function setUrl(params: Record<string, string | null>) {
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(params)) {
    if (v === null) url.searchParams.delete(k);
    else url.searchParams.set(k, v);
  }
  window.history.replaceState(null, '', url);
}

/** 生成中の候補をポーリングして本文を追記する（ストリーミング表示の代わり） */
function useGenerationPolling(
  gens: GenerationView[],
  setGens: (fn: (prev: GenerationView[]) => GenerationView[]) => void,
) {
  const [thinking, setThinking] = useState<Record<string, boolean>>({});
  const gensRef = useRef(gens);
  useEffect(() => {
    gensRef.current = gens;
  }, [gens]);
  const ids = gens
    .filter((g) => g.status === 'generating')
    .map((g) => g.id)
    .join(',');

  useEffect(() => {
    if (!ids) return;
    let stopped = false;
    let inFlight = false;
    const tick = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        for (const id of ids.split(',')) {
          const current = gensRef.current.find((g) => g.id === id);
          if (!current || current.status !== 'generating') continue;
          const from = current.content.length;
          const res = await api<GenerationPoll>(`/api/generations/${id}?from=${from}`);
          if (stopped) return;
          setThinking((t) => (t[id] === res.thinking ? t : { ...t, [id]: res.thinking }));
          setGens((prev) =>
            prev.map((g) =>
              g.id !== id
                ? g
                : {
                    ...g,
                    content: g.content.slice(0, from) + res.delta,
                    status: res.status,
                    error: res.error,
                    finishReason: res.finishReason,
                    usage: res.usage,
                    finishedAt: res.finishedAt,
                  },
            ),
          );
        }
      } catch {
        // 通信が切れていても次の回に取り直す
      } finally {
        inFlight = false;
      }
    };
    void tick();
    const timer = setInterval(tick, 800);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [ids, setGens]);

  return thinking;
}

function useElapsed(since: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (since === null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [since]);
  return since === null ? 0 : Math.max(0, Math.floor((now - since) / 1000));
}

export function EpisodeScreen(props: EpisodeProps) {
  const [view, setView] = useState(props.initialView);
  const [gens, setGens] = useState(props.generations);
  const [acceptedId, setAcceptedId] = useState(props.episode.acceptedGenerationId);
  const [summary, setSummary] = useState(props.summary);
  const [summaryStartError, setSummaryStartError] = useState<string | null>(null);
  // 候補確認を開いたときに最初に表示する候補
  const [focusId, setFocusId] = useState(props.initialGenerationId);

  const switchView = (v: 'candidates' | 'adopted', generationId?: string) => {
    setView(v);
    setUrl({ view: v === 'candidates' ? 'candidates' : null, g: generationId ?? null });
    window.scrollTo(0, 0);
  };

  if (view === 'adopted' && acceptedId) {
    return (
      <AdoptedView
        {...props}
        gens={gens}
        acceptedId={acceptedId}
        summary={summary}
        setSummary={setSummary}
        initialSummaryError={summaryStartError}
        onChange={() => {
          setFocusId(acceptedId);
          switchView('candidates', acceptedId);
        }}
      />
    );
  }
  return (
    <CandidatesView
      {...props}
      initialGenerationId={focusId}
      gens={gens}
      setGens={setGens}
      acceptedId={acceptedId}
      onAccepted={(id, s, error) => {
        setAcceptedId(id);
        if (s) setSummary(s);
        setSummaryStartError(error);
        switchView('adopted');
      }}
    />
  );
}

// ---- 候補確認（デザイン仕様 §5.3） ----

function CandidatesView({
  world,
  episode,
  gens,
  setGens,
  acceptedId,
  initialGenerationId,
  onAccepted,
}: EpisodeProps & {
  gens: GenerationView[];
  setGens: (fn: (prev: GenerationView[]) => GenerationView[]) => void;
  acceptedId: string | null;
  onAccepted: (id: string, summary: SummaryState | null, summaryError: string | null) => void;
}) {
  const [index, setIndex] = useState(() => {
    const target = initialGenerationId ?? acceptedId;
    const i = gens.findIndex((g) => g.id === target);
    return i >= 0 ? i : gens.length - 1;
  });
  const thinking = useGenerationPolling(gens, setGens);
  const [busy, setBusy] = useState<'regen' | 'accept' | 'stop' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'revise' | 'snapshot' | null>(null);
  const [revisionNote, setRevisionNote] = useState('');
  const scroller = useRef<HTMLDivElement>(null);

  const current = gens[index] ?? null;
  const anyGenerating = gens.some((g) => g.status === 'generating');
  const elapsed = useElapsed(current?.status === 'generating' ? current.createdAt : null);

  const go = useCallback(
    (i: number) => {
      if (i < 0 || i >= gens.length) return;
      setIndex(i);
      setUrl({ g: gens[i].id });
      scroller.current?.scrollTo({ top: 0 });
    },
    [gens],
  );

  async function regenerate(revision?: string) {
    setBusy('regen');
    setActionError(null);
    try {
      const res = await api<{ generation: GenerationView }>(`/api/episodes/${episode.id}/generate`, {
        body: revision && current ? { revisionOf: current.id, revisionNote: revision } : {},
      });
      setGens((prev) => [...prev, res.generation]);
      setIndex(gens.length);
      setUrl({ g: res.generation.id });
      scroller.current?.scrollTo({ top: 0 });
      setSheet(null);
      setRevisionNote('');
    } catch (err) {
      setActionError(errorMessage(err));
      setSheet(null);
    } finally {
      setBusy(null);
    }
  }

  async function accept() {
    if (!current) return;
    setBusy('accept');
    setActionError(null);
    try {
      const res = await api<{ summaryError: string | null }>(`/api/episodes/${episode.id}/accept`, {
        body: { generationId: current.id },
      });
      const s = await api<SummaryState>(`/api/episodes/${episode.id}/summary`).catch(() => null);
      onAccepted(current.id, s, res.summaryError ? `要約を自動で作れませんでした。${res.summaryError}` : null);
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function stop() {
    if (!current) return;
    setBusy('stop');
    try {
      await api(`/api/generations/${current.id}/stop`, { body: {} });
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  // 左右スワイプで候補を切り替える
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: TouchEvent) => {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: TouchEvent) => {
    if (!touch.current) return;
    const dx = e.changedTouches[0].clientX - touch.current.x;
    const dy = e.changedTouches[0].clientY - touch.current.y;
    touch.current = null;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2) go(index + (dx < 0 ? 1 : -1));
  };

  const isAccepted = current?.id === acceptedId;
  const canAccept = current && current.status !== 'generating' && current.content.trim().length > 0;

  const meta = current
    ? [
        current.model,
        `temp ${current.settings.temperature}`,
        `${formatNumber(countChars(current.content))}字`,
        formatTime(current.createdAt),
      ].join(' · ')
    : '';

  return (
    <div className="mx-auto flex h-dvh max-w-[640px] flex-col">
      <Header
        back={`/w/${world.id}/write?ep=${episode.id}`}
        title={`Episode ${episode.episodeNumber}`}
        subtitle={
          episode.title ? <p className="truncate text-[13px] text-ink-muted">{episode.title}</p> : undefined
        }
        right={
          current && (
            <IconButton label="この候補の Prompt Snapshot" onClick={() => setSheet('snapshot')}>
              <AlignLeft size={20} aria-hidden />
            </IconButton>
          )
        }
      />

      {gens.length === 0 ? (
        <div className="flex-1 px-4">
          <p className="rounded-card border border-dashed border-line-strong px-4 py-8 text-center text-[14px] text-ink-muted">
            まだ候補がありません。
          </p>
        </div>
      ) : (
        <>
          <div className="flex-none px-4">
            <div className="rounded-card border border-line bg-surface px-1.5 py-1.5">
              <div className="flex items-center justify-between">
                <IconButton
                  label="前の候補"
                  onClick={() => go(index - 1)}
                  disabled={index <= 0}
                  className="border-0 bg-transparent"
                >
                  <ChevronLeft size={22} aria-hidden />
                </IconButton>
                <p className="text-[15px] font-bold tabular-nums" aria-live="polite">
                  候補 {index + 1} / {gens.length}
                  {isAccepted && (
                    <span className="ml-2 inline-flex items-center gap-0.5 align-middle text-[12px] font-medium text-accent-ink">
                      <Check size={13} aria-hidden />
                      採用中
                    </span>
                  )}
                </p>
                <IconButton
                  label="次の候補"
                  onClick={() => go(index + 1)}
                  disabled={index >= gens.length - 1}
                  className="border-0 bg-transparent"
                >
                  <ChevronRight size={22} aria-hidden />
                </IconButton>
              </div>
              <div className="flex justify-center gap-1.5 pb-1.5" aria-hidden>
                {gens.map((g, i) => (
                  <span
                    key={g.id}
                    className={cx(
                      'h-1.5 rounded-full transition-[width]',
                      i === index ? 'w-[18px] bg-accent' : 'w-1.5 bg-line-strong',
                    )}
                  />
                ))}
              </div>
            </div>
            <p className="mt-2 truncate text-[12px] text-ink-muted">{meta}</p>
            {current?.revisionNote && (
              <p className="mt-1 line-clamp-2 text-[12px] leading-[1.6] text-ink-muted">
                修正指示：{current.revisionNote}
              </p>
            )}
            {actionError && <ErrorBanner className="mt-2" message={actionError} />}
          </div>

          <div
            ref={scroller}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6 pt-4"
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            {current?.status === 'error' && (
              <ErrorBanner
                className="mb-4 font-ui"
                message={current.error ?? '生成に失敗しました'}
                onRetry={anyGenerating ? undefined : () => void regenerate(current.revisionNote ?? undefined)}
              />
            )}
            {current?.status === 'stopped' && (
              <p className="mb-4 rounded-[12px] bg-surface px-3.5 py-2.5 text-[13px] text-ink-muted">
                生成を停止しました。ここまでの本文は残っています。
              </p>
            )}
            {current?.finishReason === 'length' && (
              <p className="mb-4 rounded-[12px] bg-surface px-3.5 py-2.5 text-[13px] leading-[1.6] text-ink-muted">
                Max Tokens の上限で本文が途切れています。Settings で上限を増やせます。
              </p>
            )}
            {current && <Prose text={current.content} />}
            {current?.status === 'generating' && (
              <div className="mt-2 flex items-center gap-3 font-ui text-[14px] text-ink-muted" role="status">
                <Spinner size={16} />
                <span>
                  {thinking[current.id] && !current.content ? '考え中…' : '生成中…'}
                  <span className="ml-1 tabular-nums">{elapsed}秒</span>
                </span>
                <button
                  type="button"
                  onClick={stop}
                  disabled={busy === 'stop'}
                  className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-line px-3 text-[13px] text-ink"
                >
                  <Square size={13} aria-hidden />
                  停止
                </button>
              </div>
            )}
          </div>
        </>
      )}

      <Dock inline>
        <DockButton
          label="再生成"
          icon={<RotateCw size={20} aria-hidden />}
          onClick={() => void regenerate()}
          disabled={anyGenerating || busy !== null}
          busy={busy === 'regen' && sheet !== 'revise'}
        />
        <DockButton
          label="修正指示"
          icon={<MessageSquareText size={20} aria-hidden />}
          onClick={() => setSheet('revise')}
          disabled={anyGenerating || busy !== null || !current?.content.trim()}
        />
        {isAccepted ? (
          <Button variant="primary" size="lg" className="flex-1" disabled icon={<Check size={19} aria-hidden />}>
            採用中
          </Button>
        ) : (
          <Button
            variant="primary"
            size="lg"
            className="flex-1"
            onClick={accept}
            disabled={!canAccept || busy !== null}
            busy={busy === 'accept'}
            busyLabel="採用中…"
            icon={<Check size={19} aria-hidden />}
          >
            この本文を採用
          </Button>
        )}
      </Dock>

      <Sheet
        open={sheet === 'revise'}
        onClose={() => setSheet(null)}
        title="修正指示"
        footer={
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            disabled={!revisionNote.trim()}
            busy={busy === 'regen'}
            busyLabel="開始中…"
            icon={<RotateCw size={18} aria-hidden />}
            onClick={() => void regenerate(revisionNote)}
          >
            この指示で再生成
          </Button>
        }
      >
        <p className="mb-2 text-[13px] leading-[1.6] text-ink-muted">
          候補 {index + 1} の本文に対する指示を書いてください。本文全体を書き直した新しい候補ができます。
        </p>
        <Label htmlFor="revision-note">修正指示</Label>
        <TextArea
          id="revision-note"
          value={revisionNote}
          onChange={(e) => setRevisionNote(e.target.value)}
          minHeight={160}
          strong
          placeholder={'例：\n会話を増やしてください。\n展開はそのままで情景描写を増やしてください。'}
        />
      </Sheet>

      {current && (
        <SnapshotSheet
          open={sheet === 'snapshot'}
          onClose={() => setSheet(null)}
          generationId={current.id}
        />
      )}
    </div>
  );
}

function SnapshotSheet({ open, onClose, generationId }: { open: boolean; onClose: () => void; generationId: string }) {
  const [data, setData] = useState<{
    id: string;
    built: BuiltContext;
    usage: Usage | null;
    createdAt: number;
    note: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || data?.id === generationId) return;
    let cancelled = false;
    api<{ snapshot: PromptSnapshot; usage: Usage | null; createdAt: number }>(
      `/api/generations/${generationId}/snapshot`,
    )
      .then((res) => {
        if (cancelled) return;
        const s = res.snapshot;
        setData({
          id: generationId,
          built: contextFromSnapshot(s),
          usage: res.usage,
          createdAt: res.createdAt,
          note: `${s.provider.name} · ${s.model} · temp ${s.generationSettings.temperature} · max ${
            s.generationSettings.maxTokens ?? '指定なし'
          }`,
        });
        setError(null);
      })
      .catch((err) => !cancelled && setError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [open, generationId, data?.id]);

  const ready = data?.id === generationId ? data : null;
  return (
    <ContextSheet
      open={open}
      onClose={onClose}
      title={ready ? `Snapshot · ${formatTime(ready.createdAt)}` : 'Snapshot'}
      built={ready?.built ?? null}
      usage={ready?.usage}
      note={ready?.note}
      loading={!ready && !error}
      error={error}
    />
  );
}

// ---- 採用後（デザイン仕様 §5.4） ----

function AdoptedView({
  world,
  episode,
  gens,
  acceptedId,
  summary,
  setSummary,
  initialSummaryError,
  onChange,
  images: initialImages,
  imageJob: initialImageJob,
  providers,
  imageDefault,
  nextEpisodeId,
}: EpisodeProps & {
  gens: GenerationView[];
  acceptedId: string;
  summary: SummaryState;
  setSummary: (s: SummaryState) => void;
  initialSummaryError: string | null;
  onChange: () => void;
}) {
  const router = useRouter();
  const acceptedIndex = gens.findIndex((g) => g.id === acceptedId);

  // ---- 次話用の要約 ----
  const [text, setText] = useState(summary.draft ?? summary.summary);
  const [summaryError, setSummaryError] = useState<string | null>(
    initialSummaryError ?? (summary.job?.status === 'error' ? summary.job.error : null),
  );
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const summaryRunning = summary.job?.status === 'running';

  // AI の要約ができあがるのを待つ
  useEffect(() => {
    if (!summaryRunning) return;
    const t = setInterval(async () => {
      try {
        const s = await api<SummaryState>(`/api/episodes/${episode.id}/summary`);
        if (s.job?.status === 'running') return;
        setSummary(s);
        setText(s.draft ?? s.summary);
        if (s.job?.status === 'error') setSummaryError(s.job.error);
      } catch {
        // 次の回に取り直す
      }
    }, 1500);
    return () => clearInterval(t);
  }, [summaryRunning, episode.id, setSummary]);

  // 編集中の要約は下書きとして自動保存する（確定はしない）
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editedRef = useRef(false);
  useEffect(() => {
    if (!editedRef.current) return;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(async () => {
      try {
        const s = await api<SummaryState>(`/api/episodes/${episode.id}/summary`, {
          method: 'PATCH',
          body: { draft: text === summary.summary ? null : text },
        });
        setSummary(s);
      } catch {
        // 保存ボタンで確定できるので、ここでは表示しない
      }
    }, 1500);
    return () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
    };
  }, [text, episode.id, summary.summary, setSummary]);

  let badge: { label: string; tone: 'neutral' | 'accent' };
  if (summaryRunning) badge = { label: '生成中…', tone: 'accent' };
  else if (summary.draft === null && text === summary.summary)
    badge = { label: summary.summary ? '保存済み' : '未作成', tone: 'neutral' };
  else if (summary.draftSource === 'ai' && text === summary.draft) badge = { label: '未保存・AI生成', tone: 'neutral' };
  else badge = { label: '未保存', tone: 'neutral' };
  const unsaved = text !== summary.summary;

  async function regenerateSummary() {
    if (unsaved && summary.draftSource === 'edit' && !confirm('編集中の要約を、新しく生成した要約で置き換えます。よろしいですか？')) {
      return;
    }
    setSummaryError(null);
    try {
      editedRef.current = false;
      await api(`/api/episodes/${episode.id}/summarize`, { body: {} });
      setSummary({ ...summary, job: { status: 'running', error: null, startedAt: Date.now() } });
    } catch (err) {
      setSummaryError(errorMessage(err));
    }
  }

  async function saveSummary(): Promise<boolean> {
    setSaving(true);
    setSummaryError(null);
    try {
      editedRef.current = false;
      if (draftTimer.current) clearTimeout(draftTimer.current);
      const s = await api<SummaryState>(`/api/episodes/${episode.id}/summary`, {
        method: 'PUT',
        body: { summary: text },
      });
      setSummary(s);
      setText(s.summary);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
      return true;
    } catch (err) {
      setSummaryError(errorMessage(err));
      return false;
    } finally {
      setSaving(false);
    }
  }

  // ---- スチル ----
  const [images, setImages] = useState(initialImages);
  const [imageJob, setImageJob] = useState(initialImageJob);
  const [imageSheet, setImageSheet] = useState<'create' | 'model' | null>(null);
  const [viewing, setViewing] = useState<ImageView | null>(null);
  const [stillInstruction, setStillInstruction] = useState('');
  const [imageModel, setImageModel] = useState<{ providerId: string; model: string } | null>(null);
  const [stillError, setStillError] = useState<string | null>(null);
  const [startingStill, setStartingStill] = useState(false);
  const imageRunning = imageJob?.status === 'running';
  const stillElapsed = useElapsed(imageRunning ? imageJob.startedAt : null);

  useEffect(() => {
    if (!imageRunning) return;
    const t = setInterval(async () => {
      try {
        const res = await api<{ images: ImageView[]; job: JobState | null }>(`/api/episodes/${episode.id}/images`);
        setImages(res.images);
        setImageJob(res.job);
      } catch {
        // 次の回に取り直す
      }
    }, 2000);
    return () => clearInterval(t);
  }, [imageRunning, episode.id]);

  async function startStill() {
    setStartingStill(true);
    setStillError(null);
    try {
      const res = await api<{ job: JobState | null }>(`/api/episodes/${episode.id}/images`, {
        body: { instruction: stillInstruction, providerId: imageModel?.providerId ?? null, model: imageModel?.model ?? null },
      });
      setImageJob(res.job);
      setImageSheet(null);
    } catch (err) {
      setStillError(errorMessage(err));
    } finally {
      setStartingStill(false);
    }
  }

  // ---- 次のエピソードへ ----
  const [goingNext, setGoingNext] = useState(false);
  async function goNext() {
    if (unsaved && text.trim()) {
      if (!confirm('編集中の要約を保存して、次のエピソードへ進みますか？')) return;
      if (!(await saveSummary())) return;
    } else if (!summary.summary.trim() && !text.trim()) {
      if (!confirm('次話用の要約がありません。要約なしで次のエピソードへ進みますか？')) return;
    }
    setGoingNext(true);
    try {
      let nextId = nextEpisodeId;
      if (!nextId) {
        const res = await api<{ episode: { id: string } }>(`/api/worlds/${world.id}/episodes`, { body: {} });
        nextId = res.episode.id;
      }
      router.push(`/w/${world.id}/write?ep=${nextId}`);
    } catch (err) {
      setSummaryError(errorMessage(err));
      setGoingNext(false);
    }
  }

  const staleSummary =
    summary.summaryGenerationId !== null && summary.summaryGenerationId !== acceptedId && (summary.draft ?? summary.summary);
  const imageChoice = imageModel
    ? `${providers.find((p) => p.id === imageModel.providerId)?.name ?? ''} · ${imageModel.model}`
    : imageDefault?.model
      ? `既定 · ${imageDefault.model}`
      : '未設定（選んでください）';

  return (
    <Page>
      <Header
        back={`/w/${world.id}/write?ep=${episode.id}`}
        title={`Episode ${episode.episodeNumber}`}
        subtitle={
          episode.title ? <p className="truncate text-[13px] text-ink-muted">{episode.title}</p> : undefined
        }
      />
      <Main className="flex flex-col gap-[22px]">
        <div className="flex items-center gap-2 rounded-[14px] border border-accent-banner-line bg-accent-banner px-3.5 py-3 text-accent-ink">
          <Check size={18} aria-hidden className="flex-none" />
          <p className="min-w-0 flex-1 text-[14px] font-medium">候補 {acceptedIndex + 1} を採用しました</p>
          <button
            type="button"
            onClick={onChange}
            className="-my-2 inline-flex h-10 flex-none items-center px-1 text-[14px] font-bold underline-offset-2 hover:underline"
          >
            変更
          </button>
        </div>

        <section aria-labelledby="sec-summary">
          <SectionHeading id="sec-summary" right={<Badge tone={badge.tone}>{badge.label}</Badge>}>
            次話用の要約
          </SectionHeading>
          {summaryError && <ErrorBanner className="mb-3" message={summaryError} onRetry={regenerateSummary} />}
          {staleSummary && !summaryRunning && (
            <p className="mb-2 text-[12px] leading-[1.6] text-ink-muted">
              この要約は、いま採用している候補とは別の候補から作られています。必要なら再生成してください。
            </p>
          )}
          <div className="relative">
            <TextArea
              aria-labelledby="sec-summary"
              value={text}
              onChange={(e) => {
                editedRef.current = true;
                setText(e.target.value);
              }}
              disabled={summaryRunning}
              minHeight={270}
              maxHeight={420}
              strong
              placeholder="次の話を書く AI に渡す要約です。「要約を再生成」で採用した本文から作れます。"
            />
            {summaryRunning && (
              <div className="absolute inset-0 flex items-center justify-center gap-2 rounded-field bg-bg/80 text-[14px] text-ink-muted">
                <Spinner size={16} /> 要約を生成中…
              </div>
            )}
          </div>
          <div className="mt-2.5 flex gap-2.5">
            <Button
              variant="secondary"
              size="lg"
              className="flex-1"
              onClick={regenerateSummary}
              disabled={summaryRunning}
              icon={<RotateCw size={17} aria-hidden />}
            >
              要約を再生成
            </Button>
            <Button
              variant="primary"
              size="lg"
              className="flex-1"
              onClick={() => void saveSummary()}
              disabled={summaryRunning || (!unsaved && summary.draft === null)}
              busy={saving}
              busyLabel="保存中…"
              icon={<Check size={18} aria-hidden />}
            >
              {savedFlash ? '保存しました' : '保存'}
            </Button>
          </div>
          <div className="mt-1 flex justify-end">
            <SavedMark show={savedFlash} />
          </div>
        </section>

        <section aria-labelledby="sec-stills">
          <SectionHeading id="sec-stills">スチル</SectionHeading>
          {imageJob?.status === 'error' && (
            <ErrorBanner className="mb-3" message={imageJob.error ?? 'スチルの生成に失敗しました'} onRetry={startStill} />
          )}
          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => setImageSheet('create')}
              disabled={imageRunning}
              className="flex h-[150px] min-w-[150px] flex-1 flex-col items-center justify-center gap-2 rounded-card border-[1.5px] border-dashed border-line-strong px-3 text-center disabled:opacity-60"
            >
              <ImagePlus size={24} aria-hidden className="text-accent-ink" />
              <span className="text-[14px] font-bold">この場面のスチルを生成</span>
              <span className="text-[12px] text-ink-muted">場面は本文から自動作成</span>
            </button>
            {imageRunning && (
              <div
                className="flex h-[150px] w-[112px] flex-none flex-col items-center justify-center gap-2 rounded-[12px] bg-surface text-[12px] text-ink-muted"
                role="status"
              >
                <Spinner size={18} />
                生成中…
                <span className="tabular-nums">{stillElapsed}秒</span>
              </div>
            )}
            {images.map((img) => (
              <button
                key={img.id}
                type="button"
                onClick={() => setViewing(img)}
                className="h-[150px] w-[112px] flex-none overflow-hidden rounded-[12px] border border-line bg-surface"
                aria-label={`スチル（${formatTime(img.createdAt)}）を拡大`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.thumbUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        </section>
      </Main>

      <Dock>
        <Button
          variant="outline"
          size="lg"
          className="flex-1"
          onClick={goNext}
          busy={goingNext}
          busyLabel="準備中…"
        >
          次のエピソードへ
          <ArrowRight size={18} aria-hidden />
        </Button>
      </Dock>

      <Sheet
        open={imageSheet === 'create'}
        onClose={() => setImageSheet(null)}
        title="スチルを生成"
        footer={
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={startStill}
            busy={startingStill}
            busyLabel="開始中…"
            icon={<ImagePlus size={18} aria-hidden />}
          >
            生成
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          {stillError && <ErrorBanner message={stillError} />}
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-ink-muted">場面</p>
            <p className="rounded-field bg-surface px-3 py-2.5 text-[14px] text-ink-sub">
              採用した本文から自動で作成します
            </p>
          </div>
          <div>
            <Label htmlFor="still-inst">追加指示</Label>
            <TextArea
              id="still-inst"
              value={stillInstruction}
              onChange={(e) => setStillInstruction(e.target.value)}
              minHeight={110}
              strong
              placeholder={'例：\n雨の夜。映画的な構図。人物を画面中央に置かない。'}
            />
          </div>
          <div>
            <span className="mb-1.5 block text-[13px] font-medium text-ink-muted">画像モデル</span>
            <button
              type="button"
              onClick={() => setImageSheet('model')}
              className="flex h-11 w-full items-center gap-2 rounded-field border border-line bg-surface px-3 text-left text-[14px]"
            >
              <span className="min-w-0 flex-1 truncate">{imageChoice}</span>
              <ChevronRight size={16} aria-hidden className="text-ink-muted" />
            </button>
          </div>
        </div>
      </Sheet>

      <ModelSheet
        open={imageSheet === 'model'}
        onClose={() => setImageSheet('create')}
        title="画像モデル"
        kind="image"
        providers={providers}
        value={imageModel}
        defaultChoice={imageDefault}
        defaultLabel="既定（画像）を使う"
        onSelect={setImageModel}
      />

      <StillViewer
        image={viewing}
        onClose={() => setViewing(null)}
        onDeleted={(id) => {
          setImages((list) => list.filter((i) => i.id !== id));
          setViewing(null);
        }}
      />
    </Page>
  );
}
