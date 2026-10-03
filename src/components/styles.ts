// クラス名の組み立て（サーバーコンポーネントからも使えるよう 'use client' の外に置く）

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

export type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type Size = 'lg' | 'md' | 'sm';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-accent text-accent-on font-bold border border-accent',
  secondary: 'bg-surface text-ink border border-line',
  outline: 'bg-transparent text-accent-ink font-bold border-[1.5px] border-accent',
  ghost: 'bg-transparent text-accent-ink border border-transparent',
  danger: 'bg-transparent text-danger border border-transparent',
};

const SIZE: Record<Size, string> = {
  lg: 'h-[54px] px-5 text-[16px] rounded-[14px]',
  md: 'h-11 px-4 text-[15px] rounded-[12px]',
  sm: 'h-10 px-3.5 text-[14px] rounded-[12px]',
};

/** ボタンの見た目（デザイン仕様 §4.1） */
export function buttonClass(variant: Variant = 'secondary', size: Size = 'md', extra?: string): string {
  return cx(
    'inline-flex items-center justify-center gap-1.5 whitespace-nowrap select-none transition-[filter,opacity]',
    'disabled:opacity-50 disabled:cursor-not-allowed enabled:active:brightness-95',
    VARIANT[variant],
    SIZE[size],
    extra,
  );
}
