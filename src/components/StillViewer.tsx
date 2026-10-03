'use client';

import Link from 'next/link';
import { Copy } from 'lucide-react';
import { useState } from 'react';
import { api, errorMessage, formatTime } from '@/lib/client';
import type { ImageView } from '@/lib/types';
import { Sheet } from './Sheet';
import { Button } from './ui';

/** スチルの拡大表示。Prompt とモデルも表示する（デザイン仕様 §5.6） */
export function StillViewer({
  image,
  onClose,
  onDeleted,
  episodeLink,
}: {
  image: ImageView | null;
  onClose: () => void;
  onDeleted: (id: string) => void;
  episodeLink?: { href: string; label: string };
}) {
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function remove() {
    if (!image || !confirm('このスチルを削除しますか？')) return;
    try {
      await api(`/api/images/${image.id}`, { method: 'DELETE' });
      onDeleted(image.id);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function copyPrompt() {
    if (!image) return;
    try {
      await navigator.clipboard.writeText(image.prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // クリップボードが使えない環境では何もしない
    }
  }

  return (
    <Sheet open={image !== null} onClose={onClose} title="スチル">
      {image && (
        <div className="flex flex-col gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.url} alt="生成したスチル" className="w-full rounded-card border border-line bg-surface" />
          <p className="text-[12px] text-ink-muted">
            {image.provider} · {image.model} · {formatTime(image.createdAt)}
          </p>
          {episodeLink && (
            <Link href={episodeLink.href} className="text-[14px] font-medium text-accent-ink">
              {episodeLink.label}
            </Link>
          )}
          {image.instruction && (
            <div>
              <p className="mb-1 text-[13px] font-medium text-ink-muted">追加指示</p>
              <p className="whitespace-pre-wrap text-[14px] leading-[1.7] text-ink-sub">{image.instruction}</p>
            </div>
          )}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <p className="text-[13px] font-medium text-ink-muted">Prompt</p>
              <button
                type="button"
                onClick={copyPrompt}
                className="inline-flex h-9 items-center gap-1 px-2 text-[13px] text-accent-ink"
              >
                <Copy size={14} aria-hidden />
                {copied ? 'コピーしました' : 'コピー'}
              </button>
            </div>
            <p className="whitespace-pre-wrap rounded-[12px] bg-surface px-3.5 py-3 font-mono text-[12px] leading-[1.6] text-ink-sub">
              {image.prompt}
            </p>
          </div>
          {error && <p className="text-[13px] text-danger">{error}</p>}
          <div>
            <Button variant="danger" size="sm" onClick={remove} className="-ml-3.5">
              このスチルを削除
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
