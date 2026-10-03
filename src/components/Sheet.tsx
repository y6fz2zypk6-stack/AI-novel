'use client';

import { X } from 'lucide-react';
import { useEffect, useId, useRef, type PointerEvent, type ReactNode } from 'react';
import { cx } from './ui';

/**
 * ボトムシート（デザイン仕様 §4.7）。
 * ネイティブの <dialog> を使い、暗幕のタップ・×・Esc・下スワイプで閉じる。
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const drag = useRef<{ startY: number; dy: number } | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    const d = ref.current;
    return () => {
      if (d?.open) d.close();
    };
  }, []);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    drag.current = { startY: e.clientY, dy: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current || !ref.current) return;
    drag.current.dy = Math.max(0, e.clientY - drag.current.startY);
    ref.current.style.transform = `translateY(${drag.current.dy}px)`;
  };
  const onPointerUp = () => {
    if (!drag.current || !ref.current) return;
    const { dy } = drag.current;
    drag.current = null;
    ref.current.style.transform = '';
    if (dy > 80) onClose();
  };

  return (
    <dialog
      ref={ref}
      className={cx('sheet', className)}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // 暗幕（dialog 要素そのもの）のタップで閉じる
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex-none touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="mx-auto mt-2 h-[5px] w-10 rounded-full bg-line-strong" aria-hidden />
        <div className="flex items-center gap-3 px-4 pb-2 pt-2">
          <h2 id={titleId} className="min-w-0 flex-1 truncate text-[17px] font-bold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-ink-muted"
          >
            <X size={22} aria-hidden />
          </button>
        </div>
      </div>
      {/*
        flex-1（flex-basis: 0%）にすると、iOS の Safari では高さが中身に合わせて決まる dialog の中で
        本文の高さが 0 として計算され、見出ししか表示されない。flex-auto で中身の高さを基準にする
      */}
      <div
        className={cx(
          'min-h-0 flex-auto overflow-y-auto overscroll-contain px-4',
          // 下のボタンが無いシートは、iPhone のホームインジケーターに中身が隠れないよう余白を取る
          footer ? 'pb-4' : 'pb-[calc(16px+env(safe-area-inset-bottom))]',
        )}
      >
        {open && children}
      </div>
      {footer && open && (
        <div className="flex-none border-t border-line px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3">
          {footer}
        </div>
      )}
    </dialog>
  );
}
