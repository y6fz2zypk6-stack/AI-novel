'use client';

import { Check, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { api, errorMessage } from '@/lib/client';
import type { GenerationView } from '@/lib/types';
import { SHEET_TEXTAREA_MAX_HEIGHT, Sheet } from './Sheet';
import { Button, ErrorBanner, TextArea } from './ui';

/**
 * 本文を手で直すシート。再生成するほどではない口調・言い回しの調整に使う。
 * AI の原文はサーバーに残るので、「AIの原文に戻す」でいつでも戻せる。
 */
export function EditSheet({
  open,
  onClose,
  title,
  generation,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  generation: { id: string; content: string; edited: boolean };
  /** 保存・原文に戻したあとの候補。呼び出し側で画面の表示を更新してシートを閉じる */
  onSaved: (generation: GenerationView) => void;
}) {
  const [text, setText] = useState(generation.content);
  const [busy, setBusy] = useState<'save' | 'revert' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 開くたびに、いまの本文から編集を始める
  const session = open ? generation.id : null;
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  if (session !== openedFor) {
    setOpenedFor(session);
    if (session) {
      setText(generation.content);
      setError(null);
    }
  }

  const dirty = text !== generation.content;

  function close() {
    if (busy) return;
    if (dirty && !confirm('直した内容を保存せずに閉じますか？')) return;
    onClose();
  }

  async function send(body: { content: string } | { revert: true }, kind: 'save' | 'revert') {
    setBusy(kind);
    setError(null);
    try {
      const res = await api<{ generation: GenerationView }>(`/api/generations/${generation.id}`, {
        method: 'PATCH',
        body,
      });
      onSaved(res.generation);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      title={title}
      footer={
        <div className="flex gap-2.5">
          {generation.edited && (
            <Button
              variant="secondary"
              size="lg"
              disabled={busy !== null}
              busy={busy === 'revert'}
              busyLabel="戻しています…"
              icon={<Undo2 size={17} aria-hidden />}
              onClick={() => {
                if (confirm('手で直した内容を消して、AIの原文に戻しますか？')) void send({ revert: true }, 'revert');
              }}
            >
              AIの原文に戻す
            </Button>
          )}
          <Button
            variant="primary"
            size="lg"
            className="flex-1"
            disabled={!dirty || !text.trim() || busy !== null}
            busy={busy === 'save'}
            busyLabel="保存中…"
            icon={<Check size={18} aria-hidden />}
            onClick={() => void send({ content: text }, 'save')}
          >
            保存
          </Button>
        </div>
      }
    >
      {error && <ErrorBanner className="mb-2" message={error} />}
      <p className="mb-2 text-[12px] leading-[1.6] text-ink-muted">
        AIの原文は残るので、いつでも戻せます。直した本文は、このあとの要約・スチル・修正指示に使われます。
      </p>
      <TextArea
        aria-label="本文"
        value={text}
        onChange={(e) => setText(e.target.value)}
        minHeight={160}
        maxHeight={SHEET_TEXTAREA_MAX_HEIGHT}
        className="font-prose"
        style={{ lineHeight: 1.85 }}
        strong
      />
    </Sheet>
  );
}
