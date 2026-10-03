'use client';

import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { useState } from 'react';
import { api, errorMessage, formatNumber } from '@/lib/client';
import { countChars } from '@/lib/tokens';
import { Dock, Header, Main, Page } from './chrome';
import { Button, ErrorBanner, Input, Label, TextArea } from './ui';

type Kind = 'character' | 'lore';

const TEXT: Record<Kind, { noun: string; nameLabel: string; namePlaceholder: string; contentPlaceholder: string }> = {
  character: {
    noun: '人物',
    nameLabel: '名前',
    namePlaceholder: '佐倉ミナ',
    contentPlaceholder: `例：
19歳。大学一年生。
人付き合いが苦手だが観察力が高い。

外見：
黒髪のショートヘア。

話し方：
短めの文章。敬語はあまり使わない。`,
  },
  lore: {
    noun: 'ロア',
    nameLabel: 'タイトル',
    namePlaceholder: '白ヶ丘高校',
    contentPlaceholder: `例：
創立80年の私立高校。
旧校舎は10年前から閉鎖されている。`,
  },
};

/** 人物・ロアの作成と編集（全画面。保存は下部に固定） */
export function EntryForm({
  kind,
  world,
  entry,
  from,
}: {
  kind: Kind;
  world: { id: string; name: string };
  entry?: { id: string; name: string; content: string };
  from?: string;
}) {
  const router = useRouter();
  const t = TEXT[kind];
  const [name, setName] = useState(entry?.name ?? '');
  const [content, setContent] = useState(entry?.content ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listHref = `/w/${world.id}/library?tab=${kind === 'character' ? 'characters' : 'lore'}`;
  const backHref = from === 'write' ? `/w/${world.id}/write` : listHref;
  const nameKey = kind === 'character' ? 'name' : 'title';

  async function save() {
    if (!name.trim()) {
      setError(`${t.nameLabel}を入力してください`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = { [nameKey]: name, content };
      if (entry) {
        await api(`/api/${kind === 'character' ? 'characters' : 'lore'}/${entry.id}`, { method: 'PATCH', body });
      } else {
        await api(`/api/worlds/${world.id}/${kind === 'character' ? 'characters' : 'lore'}`, { body });
      }
      router.push(backHref);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  async function remove() {
    if (!entry || !confirm(`「${entry.name}」を削除しますか？\nエピソードでの選択からも外れます。`)) return;
    setBusy(true);
    try {
      await api(`/api/${kind === 'character' ? 'characters' : 'lore'}/${entry.id}`, { method: 'DELETE' });
      router.push(listHref);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Page>
      <Header world={world} back={backHref} title={entry ? `${t.noun}を編集` : `${t.noun}を追加`} />
      <Main className="flex flex-col gap-5">
        {error && <ErrorBanner message={error} />}
        <div>
          <Label htmlFor="entry-name">{t.nameLabel}</Label>
          <Input
            id="entry-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t.namePlaceholder}
            maxLength={200}
            autoComplete="off"
          />
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <Label htmlFor="entry-content">内容</Label>
            <span className="text-[12px] text-ink-muted tabular-nums">{formatNumber(countChars(content))}字</span>
          </div>
          <TextArea
            id="entry-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            minHeight={320}
            strong
            placeholder={t.contentPlaceholder}
          />
          <p className="mt-1.5 text-[12px] text-ink-muted">Markdown またはプレーンテキストで自由に書けます。</p>
        </div>
        {entry && (
          <div className="pt-2">
            <Button variant="danger" size="sm" onClick={remove} disabled={busy} className="-ml-3.5">
              この{t.noun}を削除
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
