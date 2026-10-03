'use client';

import { Check, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '@/lib/client';
import type { ModelChoice, ModelInfo, ProviderView } from '@/lib/types';
import { Sheet } from './Sheet';
import { Button, Chip, Input, Label, Spinner, cx } from './ui';

type Kind = 'text' | 'image';
type Selection = { providerId: string; model: string };

// 同じ画面で何度も開いたときに取り直さない
const modelCache = new Map<string, ModelInfo[]>();

const SHOW_LIMIT = 80;

function useModels(providerId: string | null, kind: Kind, open: boolean) {
  const key = providerId ? `${providerId}:${kind}` : '';
  const [state, setState] = useState<{ key: string; models: ModelInfo[] | null; error: string | null }>({
    key: '',
    models: null,
    error: null,
  });
  useEffect(() => {
    if (!open || !key || modelCache.has(key)) return;
    let cancelled = false;
    api<{ models: ModelInfo[] }>(`/api/models?providerId=${encodeURIComponent(providerId!)}&kind=${kind}`)
      .then((res) => {
        modelCache.set(key, res.models);
        if (!cancelled) setState({ key, models: res.models, error: null });
      })
      .catch((err) => {
        if (!cancelled) setState({ key, models: null, error: errorMessage(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [open, key, providerId, kind]);
  const cached = key ? modelCache.get(key) : undefined;
  if (cached) return { models: cached, error: null, loading: false };
  if (state.key === key) return { models: state.models, error: state.error, loading: false };
  return { models: null, error: null, loading: Boolean(key) };
}

/** モデル選択のボトムシート。一覧から選ぶか、モデルIDを直接入力する */
export function ModelSheet({
  open,
  onClose,
  title = 'モデルを選択',
  kind,
  providers,
  value,
  defaultChoice,
  defaultLabel,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  kind: Kind;
  providers: ProviderView[];
  /** 選択中（null = 既定） */
  value: Selection | null;
  /** 指定すると先頭に「既定を使う」を出す */
  defaultChoice?: ModelChoice | null;
  defaultLabel?: string;
  onSelect: (choice: Selection | null) => void;
}) {
  const initialProvider = value?.providerId ?? defaultChoice?.providerId ?? providers[0]?.id ?? null;
  const [providerId, setProviderId] = useState<string | null>(initialProvider);
  const [query, setQuery] = useState('');
  const [custom, setCustom] = useState('');
  const { models, error, loading } = useModels(providerId, kind, open);

  // 開くたびに選択中の Provider へ戻す
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setProviderId(initialProvider);
      setQuery('');
      setCustom('');
    }
  }

  const filtered = useMemo(() => {
    if (!models) return [];
    const q = query.trim().toLowerCase();
    return q ? models.filter((m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)) : models;
  }, [models, query]);

  const choose = (choice: Selection | null) => {
    onSelect(choice);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="flex flex-col gap-4">
        {defaultChoice !== undefined && (
          <button
            type="button"
            aria-pressed={value === null}
            onClick={() => choose(null)}
            className={cx(
              'flex min-h-14 items-center gap-3 rounded-[14px] border px-3.5 py-2.5 text-left',
              value === null ? 'border-accent bg-accent-soft' : 'border-line bg-surface',
            )}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-bold">{defaultLabel ?? '既定を使う'}</span>
              <span className="block truncate text-[12px] text-ink-muted">
                {defaultChoice ? `${defaultChoice.providerName} · ${defaultChoice.model || '未設定'}` : '未設定'}
              </span>
            </span>
            {value === null && <Check size={18} className="text-accent-ink" aria-hidden />}
          </button>
        )}

        {providers.length > 1 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Provider">
            {providers.map((p) => (
              <Chip key={p.id} pressed={p.id === providerId} onClick={() => setProviderId(p.id)}>
                {p.name}
              </Chip>
            ))}
          </div>
        )}

        <div>
          <Label htmlFor="model-custom">モデルIDを直接入力</Label>
          <div className="flex gap-2">
            <Input
              id="model-custom"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder={kind === 'image' ? '例: google/gemini-2.5-flash-image' : '例: anthropic/claude-opus-5.5'}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <Button
              variant="secondary"
              disabled={!custom.trim() || !providerId}
              onClick={() => providerId && choose({ providerId, model: custom.trim() })}
            >
              使う
            </Button>
          </div>
        </div>

        <div>
          <div className="relative">
            <Search size={17} className="pointer-events-none absolute left-3 top-3.5 text-ink-muted" aria-hidden />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="一覧から検索"
              aria-label="モデルを検索"
              className="pl-9"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
          <div className="mt-2">
            {loading && (
              <div className="flex items-center gap-2 py-4 text-[14px] text-ink-muted">
                <Spinner size={16} /> モデル一覧を取得中…
              </div>
            )}
            {error && <p className="py-3 text-[13px] leading-[1.6] text-danger">{error}</p>}
            {models && filtered.length === 0 && (
              <p className="py-3 text-[13px] text-ink-muted">該当するモデルがありません。上の欄にIDを直接入力できます。</p>
            )}
            <ul className="flex flex-col">
              {filtered.slice(0, SHOW_LIMIT).map((m) => {
                const selected = value?.providerId === providerId && value?.model === m.id;
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() => providerId && choose({ providerId, model: m.id })}
                      className="flex min-h-12 w-full items-center gap-3 border-b border-line py-2 text-left"
                    >
                      <span className="min-w-0 flex-1">
                        <span className={cx('block truncate text-[14px]', selected && 'font-bold text-accent-ink')}>
                          {m.id}
                        </span>
                        {(m.name !== m.id || m.contextLength) && (
                          <span className="block truncate text-[12px] text-ink-muted">
                            {[m.name !== m.id ? m.name : null, m.contextLength ? `${Math.round(m.contextLength / 1000)}k` : null]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        )}
                      </span>
                      {selected && <Check size={18} className="text-accent-ink" aria-hidden />}
                    </button>
                  </li>
                );
              })}
            </ul>
            {filtered.length > SHOW_LIMIT && (
              <p className="py-3 text-[12px] text-ink-muted">
                ほか {filtered.length - SHOW_LIMIT} 件。検索で絞り込んでください。
              </p>
            )}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
