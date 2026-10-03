'use client';

import { Copy } from 'lucide-react';
import { useState } from 'react';
import { formatNumber } from '@/lib/client';
import type { BuiltContext } from '@/lib/prompt';
import type { Usage } from '@/lib/types';
import { Sheet } from './Sheet';
import { Spinner, cx } from './ui';

/**
 * Context Preview / Prompt Snapshot（デザイン仕様 §5.5、機能仕様 §17・§18）。
 * セクションごとの推定トークン数を、いちばん大きいセクションを100%とした横バーで示す。
 */
export function ContextSheet({
  open,
  onClose,
  title,
  built,
  loading,
  error,
  usage,
  note,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  built: BuiltContext | null;
  loading?: boolean;
  error?: string | null;
  /** Provider が返した実測値（生成後のみ） */
  usage?: Usage | null;
  note?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  async function copy() {
    if (!built) return;
    try {
      await navigator.clipboard.writeText(built.fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // クリップボードが使えない環境では何もしない
    }
  }

  const max = built ? Math.max(...built.sections.map((s) => s.tokens), 1) : 1;
  const maxKey = built?.sections.reduce((a, s) => (s.tokens > a.tokens ? s : a), built.sections[0])?.key;

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {loading && (
        <div className="flex items-center gap-2 py-6 text-[14px] text-ink-muted">
          <Spinner size={16} /> 読み込み中…
        </div>
      )}
      {error && <p className="py-4 text-[14px] text-danger">{error}</p>}
      {built && (
        <div className="flex flex-col gap-5">
          {note && <p className="text-[13px] leading-[1.6] text-ink-muted">{note}</p>}
          <ul className="flex flex-col gap-3.5">
            {built.sections.map((s) => {
              const top = s.key === maxKey;
              return (
                <li key={s.key}>
                  <div className="flex items-baseline justify-between gap-3 text-[14px]">
                    <span>
                      {s.label}
                      {s.count !== undefined && <span className="ml-1 text-ink-muted">({s.count})</span>}
                    </span>
                    <span className={cx('tabular-nums', top ? 'font-bold text-accent-ink' : 'text-ink-sub')}>
                      {formatNumber(s.tokens)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                    <div
                      className={cx('h-full rounded-full', top ? 'bg-accent' : 'bg-neutral-bar')}
                      style={{ width: `${Math.max(2, (s.tokens / max) * 100)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="flex items-baseline justify-between border-t border-line pt-3.5">
            <span className="text-[14px] text-ink-muted">合計（推定）</span>
            <span className="text-[22px] font-bold tabular-nums">
              {formatNumber(built.totalTokens)}
              <span className="ml-1 text-[13px] font-normal text-ink-muted">tokens</span>
            </span>
          </div>
          <p className="-mt-3 text-right text-[12px] text-ink-muted">{formatNumber(built.totalChars)} 字</p>

          {usage && (usage.promptTokens || usage.completionTokens) && (
            <div className="rounded-[12px] bg-surface px-3.5 py-3 text-[13px] leading-[1.7] text-ink-sub">
              <p className="font-medium">実測（Provider の集計）</p>
              <p className="tabular-nums">
                入力 {formatNumber(usage.promptTokens ?? 0)} / 出力 {formatNumber(usage.completionTokens ?? 0)} tokens
                {usage.cost !== undefined && ` · $${usage.cost.toFixed(4)}`}
              </p>
            </div>
          )}

          <section aria-label="全文" className="rounded-[12px] border border-line bg-surface">
            <div className="flex h-11 items-center justify-between pl-3.5 pr-1.5">
              <span className="text-[14px] font-medium">全文</span>
              <button
                type="button"
                onClick={() => void copy()}
                className="inline-flex h-9 items-center gap-1 rounded-[10px] px-2.5 text-[13px] text-accent-ink"
              >
                <Copy size={15} aria-hidden />
                {copied ? 'コピーしました' : 'コピー'}
              </button>
            </div>
            <pre
              className={cx(
                'whitespace-pre-wrap break-words border-t border-line px-3.5 py-3 font-mono text-[12px] leading-[1.6] text-ink-sub',
                !expanded && 'max-h-40 overflow-hidden',
              )}
            >
              {built.fullText}
            </pre>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="flex h-11 w-full items-center justify-center border-t border-line text-[13px] text-accent-ink"
            >
              {expanded ? '折りたたむ' : '全文を表示'}
            </button>
          </section>
        </div>
      )}
    </Sheet>
  );
}
