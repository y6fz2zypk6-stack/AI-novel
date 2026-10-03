'use client';

import Link from 'next/link';
import { Check, LoaderCircle, RotateCw } from 'lucide-react';
import {
  forwardRef,
  useCallback,
  useLayoutEffect,
  useRef,
  type ButtonHTMLAttributes,
  type ComponentProps,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { buttonClass, cx, type Size, type Variant } from './styles';

export { buttonClass, cx };

export function Spinner({ size = 18, className }: { size?: number; className?: string }) {
  return <LoaderCircle size={size} strokeWidth={2} className={cx('spin', className)} aria-hidden />;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  /** 実行中。無効化してスピナーと busyLabel を出す */
  busy?: boolean;
  busyLabel?: string;
  icon?: ReactNode;
};

export function Button({
  variant = 'secondary',
  size = 'md',
  busy,
  busyLabel,
  icon,
  className,
  children,
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass(variant, size, className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...props}
    >
      {busy ? <Spinner size={size === 'lg' ? 19 : 17} /> : icon}
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
}

export function LinkButton({
  variant = 'secondary',
  size = 'md',
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

/** アイコンだけのボタン（44×44）。aria-label 必須 */
export function IconButton({
  label,
  className,
  children,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex h-11 w-11 flex-none items-center justify-center rounded-[12px] border border-line bg-surface text-ink',
        'disabled:opacity-40 enabled:active:brightness-95',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function IconLink({
  label,
  className,
  children,
  ...props
}: ComponentProps<typeof Link> & { label: string }) {
  return (
    <Link
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex h-11 w-11 flex-none items-center justify-center rounded-[12px] border border-line bg-surface text-ink',
        className,
      )}
      {...props}
    >
      {children}
    </Link>
  );
}

/** Action Dock の縦型ボタン（76×56、アイコンの下にラベル） */
export function DockButton({
  label,
  icon,
  busy,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; icon: ReactNode; busy?: boolean }) {
  return (
    <button
      type="button"
      className={cx(
        'flex h-14 w-[76px] flex-none flex-col items-center justify-center gap-0.5 rounded-[12px] border border-line bg-surface text-ink',
        'disabled:opacity-40 enabled:active:brightness-95',
        className,
      )}
      disabled={props.disabled || busy}
      {...props}
    >
      {busy ? <Spinner size={20} /> : icon}
      <span className="text-[11px] leading-none">{label}</span>
    </button>
  );
}

// ---- Chip（デザイン仕様 §4.2） ----

export function Chip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cx(
        'inline-flex h-10 max-w-full items-center gap-1 rounded-chip border px-4 text-[14px] leading-none',
        pressed ? 'border-accent bg-accent-soft font-medium text-accent-strong' : 'border-line bg-surface text-ink-muted',
      )}
    >
      {pressed && <Check size={15} strokeWidth={2.2} aria-hidden className="-ml-1" />}
      <span className="truncate">{children}</span>
    </button>
  );
}

// ---- 入力欄（デザイン仕様 §4.3） ----

const FOCUS = 'outline-none focus:border-accent focus:bg-bg focus:shadow-[0_0_0_3px_rgba(227,168,87,0.25)]';

export function Label({ htmlFor, children, className }: { htmlFor: string; children: ReactNode; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={cx('mb-1.5 block text-[13px] font-medium text-ink-muted', className)}>
      {children}
    </label>
  );
}

export const Input = forwardRef<HTMLInputElement, ComponentProps<'input'>>(function Input(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cx(
        'h-11 w-full min-w-0 rounded-field border border-line bg-surface px-3 text-[16px] text-ink placeholder:text-ink-muted/70',
        FOCUS,
        className,
      )}
      {...props}
    />
  );
});

/** 入力に応じて高さが伸びるテキストエリア */
export function TextArea({
  className,
  minHeight = 120,
  maxHeight,
  strong = false,
  value,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  minHeight?: number;
  /** これ以上は伸ばさず、欄の中でスクロールさせる */
  maxHeight?: number;
  strong?: boolean;
  value: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const wanted = Math.max(minHeight, el.scrollHeight + 2);
    el.style.height = `${maxHeight ? Math.min(wanted, maxHeight) : wanted}px`;
    el.style.overflowY = maxHeight && wanted > maxHeight ? 'auto' : 'hidden';
  }, [minHeight, maxHeight]);
  useLayoutEffect(resize, [value, resize]);
  return (
    <textarea
      ref={ref}
      value={value}
      className={cx(
        'block w-full resize-none rounded-field border p-3 text-[16px] leading-[1.7] text-ink placeholder:text-ink-muted/70',
        strong ? 'border-line-strong bg-bg' : 'border-line bg-surface',
        FOCUS,
        className,
      )}
      style={{ minHeight }}
      {...props}
    />
  );
}

// ---- Card / Badge / Section ----

export function Card({ className, children, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cx('rounded-card border border-line bg-surface p-4', className)} {...props}>
      {children}
    </div>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'ok' }) {
  return (
    <span
      className={cx(
        'inline-flex h-6 flex-none items-center gap-1 rounded-full px-2 text-[12px] leading-none',
        tone === 'accent' && 'bg-accent-soft text-accent-strong',
        tone === 'ok' && 'bg-surface-2 text-ink-sub',
        tone === 'neutral' && 'bg-surface-2 text-ink-sub',
      )}
    >
      {children}
    </span>
  );
}

export function SectionHeading({ id, children, right }: { id?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-3">
      <h2 id={id} className="text-[15px] font-bold leading-[1.4]">
        {children}
      </h2>
      {right}
    </div>
  );
}

// ---- Banner（デザイン仕様 §4.8） ----

export function ErrorBanner({
  message,
  onRetry,
  retryLabel = '再試行',
  className,
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cx(
        'flex items-start gap-3 rounded-[14px] border border-danger bg-danger-soft px-3.5 py-3 text-[14px] text-danger',
        className,
      )}
    >
      <p className="min-w-0 flex-1 leading-[1.6]">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="-my-1 inline-flex h-9 flex-none items-center gap-1 rounded-[10px] border border-danger px-3 text-[13px] font-bold"
        >
          <RotateCw size={14} aria-hidden />
          {retryLabel}
        </button>
      )}
    </div>
  );
}

export function EmptyState({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-card border border-dashed border-line-strong px-4 py-8 text-center">
      <p className="text-[14px] text-ink-muted">{text}</p>
      {action}
    </div>
  );
}

/** 押した直後に「保存しました ✓」を1.5秒出すための表示 */
export function SavedMark({ show, children = '保存しました' }: { show: boolean; children?: ReactNode }) {
  return (
    <span
      aria-live="polite"
      className={cx('inline-flex items-center gap-1 text-[12px] text-ink-muted', !show && 'invisible')}
    >
      <Check size={13} aria-hidden />
      {children}
    </span>
  );
}
