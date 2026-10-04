'use client';

import { X } from 'lucide-react';
import { useEffect, useId, useRef, type PointerEvent, type ReactNode } from 'react';
import { cx } from './ui';

/**
 * シートの中のテキストエリアを、見出し・説明1段落・下のボタンと一緒にシートへ収まる高さで止めるための値。
 * これより長い文章はテキストエリアの中でスクロールする（TextArea の maxHeight に渡す）。
 */
export const SHEET_TEXTAREA_MAX_HEIGHT = 'calc(var(--sheet-height) - 230px - var(--sheet-safe))';

/**
 * ボトムシート（デザイン仕様 §4.7）。
 * ネイティブの <dialog> を使い、暗幕のタップ・×・Esc・下スワイプで閉じる。
 * 中身が長いときは dialog 自身がスクロールし、見出しと下のボタンは固定したままにする。
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
    if (open && !d.open) {
      d.showModal();
      d.scrollTop = 0;
    }
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    const d = ref.current;
    return () => {
      if (d?.open) d.close();
    };
  }, []);

  // キーボードが出たら、画面の見えている範囲（visualViewport）の中にシートを収める。
  // iOS ではキーボードが出てもページの高さが変わらず、下に付けたシートがキーボードの裏に隠れるため。
  useEffect(() => {
    const d = ref.current;
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!open || !d || !vv) return;
    let frame = 0;
    const apply = () => {
      const covered = Math.max(0, Math.round(window.innerHeight - (vv.offsetTop + vv.height)));
      if (covered > 40) {
        d.style.setProperty('--sheet-bottom', `${covered}px`);
        d.style.setProperty('--sheet-max', `${Math.max(200, Math.round(vv.height - 8))}px`);
        // キーボードの上ではホームインジケーター分の余白は要らない
        d.style.setProperty('--sheet-safe-bottom', '0px');
      } else {
        d.style.removeProperty('--sheet-bottom');
        d.style.removeProperty('--sheet-max');
        d.style.removeProperty('--sheet-safe-bottom');
      }
    };
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(apply);
    };
    apply();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      d.style.removeProperty('--sheet-bottom');
      d.style.removeProperty('--sheet-max');
      d.style.removeProperty('--sheet-safe-bottom');
    };
  }, [open]);

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
        className="sticky top-0 z-10 touch-none select-none bg-bg"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="h-2" aria-hidden />
        <div className="mx-auto h-[5px] w-10 rounded-full bg-line-strong" aria-hidden />
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
      <div className={cx('px-4', footer ? 'pb-4' : 'sheet-end')}>{open && children}</div>
      {footer && open && (
        <div className="sheet-footer sticky bottom-0 z-10 border-t border-line bg-bg px-4 pt-3">{footer}</div>
      )}
    </dialog>
  );
}
