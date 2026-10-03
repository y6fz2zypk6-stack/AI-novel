'use client';

import Link from 'next/link';
import { ChevronRight, Plus } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api, errorMessage } from '@/lib/client';
import type { AppSettings, ModelChoice, ModelPurpose, ProviderView } from '@/lib/types';
import { Header, Main, Page } from './chrome';
import { ModelSheet } from './ModelSheet';
import { ErrorBanner, SavedMark, cx } from './ui';

type Defaults = Record<ModelPurpose, ModelChoice | null>;

const PURPOSES: { key: ModelPurpose; label: string }[] = [
  { key: 'writing', label: '執筆' },
  { key: 'summary', label: '要約' },
  { key: 'image', label: '画像' },
];

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-[12px] font-medium tracking-[0.06em] text-ink-muted">{title}</h2>
      <div className="overflow-hidden rounded-card border border-line bg-surface">{children}</div>
    </section>
  );
}

const rowClass = 'flex min-h-14 w-full items-center gap-3 border-b border-line px-4 py-2.5 text-left last:border-b-0';

/** Settings（デザイン仕様 §5.7） */
export function SettingsScreen({
  providers,
  settings: initialSettings,
  defaults: initialDefaults,
  version,
}: {
  providers: ProviderView[];
  settings: AppSettings;
  defaults: Defaults;
  version: string;
}) {
  const [defaults, setDefaults] = useState(initialDefaults);
  const [picking, setPicking] = useState<ModelPurpose | null>(null);
  const [temperature, setTemperature] = useState(initialSettings.temperature);
  const [maxTokens, setMaxTokens] = useState(initialSettings.maxTokens === null ? '' : String(initialSettings.maxTokens));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // 生成パラメータは変更から少し待って自動保存する
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(async () => {
      try {
        await api('/api/settings', {
          method: 'PATCH',
          body: { temperature, maxTokens: maxTokens.trim() === '' ? null : Number(maxTokens) },
        });
        setError(null);
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      } catch (err) {
        setError(errorMessage(err));
      }
    }, 600);
    return () => clearTimeout(t);
  }, [temperature, maxTokens]);

  async function chooseDefault(purpose: ModelPurpose, choice: { providerId: string; model: string } | null) {
    if (!choice) return;
    try {
      const res = await api<{ defaults: Defaults }>('/api/settings', {
        method: 'PATCH',
        body: { defaultModel: { purpose, ...choice } },
      });
      setDefaults(res.defaults);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Page>
      <Header title="Settings" />
      <Main className="flex flex-col gap-6">
        {error && <ErrorBanner message={error} />}

        <Group title="PROVIDER">
          {providers.map((p) => {
            const connected = Boolean(p.maskedKey);
            return (
              <Link key={p.id} href={`/settings/providers/${p.id}`} className={rowClass}>
                <span
                  className={cx('h-2.5 w-2.5 flex-none rounded-full', connected ? 'bg-ok' : 'bg-neutral-bar')}
                  aria-label={connected ? 'API キー設定済み' : 'API キー未設定'}
                  role="img"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{p.name}</span>
                  <span className="block truncate text-[12px] text-ink-muted">
                    {p.maskedKey ? `${p.maskedKey}${p.keySource === 'env' ? '（環境変数）' : ''}` : p.baseUrl}
                  </span>
                </span>
                <ChevronRight size={18} className="flex-none text-ink-muted" aria-hidden />
              </Link>
            );
          })}
          <Link href="/settings/providers/new" className={cx(rowClass, 'text-accent-ink')}>
            <Plus size={18} aria-hidden />
            <span className="text-[15px] font-medium">Provider を追加</span>
          </Link>
        </Group>

        <Group title="既定モデル">
          {PURPOSES.map(({ key, label }) => {
            const d = defaults[key];
            return (
              <button key={key} type="button" className={rowClass} onClick={() => setPicking(key)}>
                <span className="w-12 flex-none text-[15px]">{label}</span>
                <span className="min-w-0 flex-1 text-right">
                  <span className={cx('block truncate text-[14px]', !d?.model && 'text-danger')}>
                    {d?.model || '未設定'}
                  </span>
                  {d && providers.length > 1 && (
                    <span className="block truncate text-[12px] text-ink-muted">{d.providerName}</span>
                  )}
                </span>
                <ChevronRight size={18} className="flex-none text-ink-muted" aria-hidden />
              </button>
            );
          })}
        </Group>

        <Group title="生成パラメータ">
          <div className="border-b border-line px-4 py-3.5">
            <div className="flex items-center justify-between">
              <label htmlFor="temperature" className="text-[15px]">
                Temperature
              </label>
              <span className="text-[15px] font-medium tabular-nums">{temperature.toFixed(2)}</span>
            </div>
            <input
              id="temperature"
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
              className="mt-2 h-8 w-full"
            />
          </div>
          <div className="flex min-h-14 items-center gap-3 px-4 py-2">
            <label htmlFor="max-tokens" className="flex-1 text-[15px]">
              Max Tokens
            </label>
            <input
              id="max-tokens"
              type="number"
              inputMode="numeric"
              min={1}
              value={maxTokens}
              onChange={(e) => setMaxTokens(e.target.value)}
              placeholder="上限なし"
              className="h-11 w-32 rounded-field border border-line bg-bg px-3 text-right text-[16px] tabular-nums outline-none focus:border-accent focus:shadow-[0_0_0_3px_rgba(227,168,87,0.25)]"
            />
          </div>
        </Group>
        <div className="-mt-4 flex justify-end">
          <SavedMark show={saved} />
        </div>

        <p className="text-center text-[12px] text-ink-muted">Novel Studio {version}</p>
      </Main>

      {PURPOSES.map(({ key, label }) => (
        <ModelSheet
          key={key}
          open={picking === key}
          onClose={() => setPicking(null)}
          title={`既定モデル（${label}）`}
          kind={key === 'image' ? 'image' : 'text'}
          providers={providers}
          value={defaults[key] ? { providerId: defaults[key]!.providerId, model: defaults[key]!.model } : null}
          onSelect={(choice) => void chooseDefault(key, choice)}
        />
      ))}
    </Page>
  );
}
