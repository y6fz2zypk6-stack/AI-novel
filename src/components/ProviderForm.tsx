'use client';

import { useRouter } from 'next/navigation';
import { Check, PlugZap } from 'lucide-react';
import { useState } from 'react';
import { api, errorMessage } from '@/lib/client';
import type { ProviderType, ProviderView } from '@/lib/types';
import { Dock, Header, Main, Page } from './chrome';
import { Button, Chip, ErrorBanner, Input, Label } from './ui';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1';

/** Provider の追加・編集（機能仕様 §19・§27・§30）。API キーは画面に再表示しない */
export function ProviderForm({ provider }: { provider?: ProviderView }) {
  const router = useRouter();
  const [name, setName] = useState(provider?.name ?? '');
  const [type, setType] = useState<ProviderType>(provider?.type ?? 'openai-compatible');
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? '');
  const [apiKey, setApiKey] = useState('');
  const [clearKey, setClearKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  function pickType(t: ProviderType) {
    setType(t);
    if (t === 'openrouter' && !baseUrl.trim()) setBaseUrl(OPENROUTER_URL);
    if (t === 'openrouter' && !name.trim()) setName('OpenRouter');
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { name, type, baseUrl };
      if (apiKey.trim()) body.apiKey = apiKey.trim();
      else if (clearKey) body.apiKey = '';
      if (provider) await api(`/api/providers/${provider.id}`, { method: 'PATCH', body });
      else await api('/api/providers', { body });
      router.push('/settings');
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  async function runTest() {
    if (!provider) return;
    setTesting(true);
    setTest(null);
    try {
      setTest(await api<{ ok: boolean; message: string }>(`/api/providers/${provider.id}/test`, { body: {} }));
    } catch (err) {
      setTest({ ok: false, message: errorMessage(err) });
    } finally {
      setTesting(false);
    }
  }

  async function remove() {
    if (!provider || !confirm(`Provider「${provider.name}」を削除しますか？`)) return;
    setBusy(true);
    try {
      await api(`/api/providers/${provider.id}`, { method: 'DELETE' });
      router.push('/settings');
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  const keyHint = provider?.maskedKey
    ? provider.keySource === 'env'
      ? `環境変数 OPENROUTER_API_KEY を使用中（${provider.maskedKey}）。ここで入力するとそちらが優先されます。`
      : `保存済み：${provider.maskedKey}。変更するときだけ入力してください。`
    : type === 'openrouter'
      ? 'OpenRouter の API キー（sk-or-…）を入力してください。'
      : 'キーが不要な API（手元の LLM サーバーなど）は空欄のままで構いません。';

  return (
    <Page>
      <Header back="/settings" title={provider ? provider.name : 'Provider を追加'} />
      <Main className="flex flex-col gap-5">
        {error && <ErrorBanner message={error} />}
        <div>
          <Label htmlFor="pv-name">名前</Label>
          <Input
            id="pv-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例: OpenRouter / 手元のLLM"
            maxLength={100}
            autoComplete="off"
          />
        </div>
        <div>
          <span id="pv-type" className="mb-1.5 block text-[13px] font-medium text-ink-muted">
            種類
          </span>
          <div role="group" aria-labelledby="pv-type" className="flex flex-wrap gap-2">
            <Chip pressed={type === 'openrouter'} onClick={() => pickType('openrouter')}>
              OpenRouter
            </Chip>
            <Chip pressed={type === 'openai-compatible'} onClick={() => pickType('openai-compatible')}>
              OpenAI 互換
            </Chip>
          </div>
        </div>
        <div>
          <Label htmlFor="pv-url">Base URL</Label>
          <Input
            id="pv-url"
            type="url"
            inputMode="url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={type === 'openrouter' ? OPENROUTER_URL : 'https://example.com/v1'}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
        <div>
          <Label htmlFor="pv-key">API Key</Label>
          <Input
            id="pv-key"
            type="password"
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              setClearKey(false);
            }}
            placeholder={provider?.maskedKey ?? 'sk-…'}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          <p className="mt-1.5 text-[12px] leading-[1.6] text-ink-muted">{keyHint}</p>
          {provider?.keySource === 'db' && (
            <label className="mt-2 flex min-h-11 items-center gap-2 text-[14px]">
              <input
                type="checkbox"
                checked={clearKey}
                onChange={(e) => setClearKey(e.target.checked)}
                className="h-5 w-5 accent-[#C98A2E]"
              />
              保存済みのキーを削除する
            </label>
          )}
        </div>

        {provider && (
          <div className="flex flex-col gap-2">
            <Button
              variant="secondary"
              onClick={runTest}
              busy={testing}
              busyLabel="確認中…"
              icon={<PlugZap size={17} aria-hidden />}
              className="self-start"
            >
              接続テスト
            </Button>
            {test && (
              <p className={test.ok ? 'text-[13px] text-ok' : 'text-[13px] leading-[1.6] text-danger'} role="status">
                {test.message}
              </p>
            )}
            <p className="text-[12px] text-ink-muted">保存済みの設定で確認します。変更した場合は先に保存してください。</p>
          </div>
        )}

        {provider && (
          <div className="pt-2">
            <Button variant="danger" size="sm" onClick={remove} disabled={busy} className="-ml-3.5">
              この Provider を削除
            </Button>
          </div>
        )}
      </Main>
      <Dock>
        <Button
          variant="primary"
          size="lg"
          className="flex-1"
          onClick={save}
          busy={busy}
          busyLabel="保存中…"
          icon={<Check size={19} aria-hidden />}
        >
          保存
        </Button>
      </Dock>
    </Page>
  );
}
