'use client';

import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { useState } from 'react';
import { BASE_PATH, api, errorMessage } from '@/lib/client';
import { Dock, Header, Main, Page } from './chrome';
import { Button, ErrorBanner, Input, Label, TextArea } from './ui';

type World = { id: string; name: string; description: string; baseInstruction: string };

const INSTRUCTION_PLACEHOLDER = `例：
三人称一元視点。
心理描写を重視する。
説明しすぎず、可能な限り行動や会話から情報を伝える。
会話文は自然な現代日本語にする。`;

/** World の作成・編集（デザイン仕様 §5.1。全画面フォーム、保存は下部に固定） */
export function WorldForm({ world }: { world?: World }) {
  const router = useRouter();
  const [name, setName] = useState(world?.name ?? '');
  const [description, setDescription] = useState(world?.description ?? '');
  const [baseInstruction, setBaseInstruction] = useState(world?.baseInstruction ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) {
      setError('名前を入力してください');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = { name, description, baseInstruction };
      if (world) {
        await api(`/api/worlds/${world.id}`, { method: 'PATCH', body });
        router.push(`/w/${world.id}/write`);
      } else {
        const res = await api<{ world: World }>('/api/worlds', { body });
        router.push(`/w/${res.world.id}/write`);
      }
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  async function remove() {
    if (!world) return;
    if (!confirm(`「${world.name}」を削除しますか？\n人物・ロア・エピソード・スチルもすべて削除され、元に戻せません。`)) return;
    setBusy(true);
    try {
      await api(`/api/worlds/${world.id}`, { method: 'DELETE' });
      document.cookie = `novel_world=; path=${BASE_PATH || '/'}; max-age=0`;
      router.push('/');
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Page>
      <Header back={world ? `/w/${world.id}/write` : '/'} title={world ? 'World を編集' : '新しい World'} />
      <Main className="flex flex-col gap-5">
        {error && <ErrorBanner message={error} />}
        <div>
          <Label htmlFor="world-name">名前</Label>
          <Input
            id="world-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="学園ミステリー"
            maxLength={200}
            autoComplete="off"
          />
        </div>
        <div>
          <Label htmlFor="world-desc">説明</Label>
          <TextArea
            id="world-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            minHeight={88}
            placeholder="一覧に表示する短い説明"
          />
        </div>
        <div>
          <Label htmlFor="world-inst">基礎執筆指示</Label>
          <p className="-mt-1 mb-2 text-[12px] leading-[1.6] text-ink-muted">
            この World で書くすべての本文に付ける執筆指示です（文体・視点など）。
          </p>
          <TextArea
            id="world-inst"
            value={baseInstruction}
            onChange={(e) => setBaseInstruction(e.target.value)}
            minHeight={240}
            strong
            placeholder={INSTRUCTION_PLACEHOLDER}
          />
        </div>
        {world && (
          <div className="pt-4">
            <Button variant="danger" size="sm" onClick={remove} disabled={busy} className="-ml-3.5">
              この World を削除
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
