'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Book, ChevronDown, ChevronLeft, Globe, PenLine, SlidersHorizontal } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { BASE_PATH } from '@/lib/client';
import { cx, IconLink } from './ui';

// ---- Header（デザイン仕様 §3） ----

export function Header({
  world,
  title,
  subtitle,
  back,
  right,
}: {
  world?: { id: string; name: string } | null;
  title: ReactNode;
  subtitle?: ReactNode;
  back?: string;
  right?: ReactNode;
}) {
  return (
    <header className="flex items-start gap-2.5 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+12px)]">
      {back && (
        <IconLink href={back} label="戻る" className="mt-0.5">
          <ChevronLeft size={22} aria-hidden />
        </IconLink>
      )}
      <div className="min-w-0 flex-1">
        {world && (
          <Link
            href="/"
            className="inline-flex max-w-full items-center gap-0.5 text-[13px] font-medium text-accent-ink hover:text-accent-strong"
          >
            <span className="truncate">{world.name}</span>
            <ChevronDown size={14} aria-hidden className="flex-none" />
            <span className="sr-only">（Worlds へ）</span>
          </Link>
        )}
        <h1 className="truncate text-[22px] font-bold leading-[1.3]">{title}</h1>
        {subtitle}
      </div>
      {right && <div className="mt-0.5 flex flex-none items-center gap-2">{right}</div>}
    </header>
  );
}

// ---- Action Dock ----

/** 画面下部に固定する主要操作の領域。inline のときは画面の縦並びの最後に置く */
export function Dock({ children, inline }: { children: ReactNode; inline?: boolean }) {
  if (inline) {
    return (
      <div className="flex-none border-t border-line bg-bg pb-[calc(10px+env(safe-area-inset-bottom))] pt-2.5">
        <div className="mx-auto flex max-w-[640px] items-center gap-2.5 px-4">{children}</div>
      </div>
    );
  }
  return (
    <div id="dock" className="fixed inset-x-0 z-20 border-t border-line bg-bg/95 backdrop-blur-sm">
      <div className="mx-auto flex h-[var(--dock-h)] max-w-[640px] items-center gap-2.5 px-4">{children}</div>
    </div>
  );
}

/** 通常の画面の外枠（縦スクロール） */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('mx-auto w-full max-w-[640px]', className)}>{children}</div>;
}

export function Main({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={cx('page-main px-4', className)}>{children}</main>;
}

// ---- Tab Bar（デザイン仕様 §4.6） ----

const COOKIE = 'novel_world';

/** 候補確認・採用後・全画面の編集では隠す */
function hiddenOn(path: string): boolean {
  return (
    /^\/w\/[^/]+\/(episodes|edit|characters|lore)(\/|$)/.test(path) ||
    path.startsWith('/worlds/') ||
    path.startsWith('/settings/')
  );
}

export function TabBar({ initialWorldId }: { initialWorldId: string | null }) {
  const pathname = usePathname() ?? '/';
  const worldInPath = pathname.match(/^\/w\/([^/]+)/)?.[1] ?? null;
  const [lastWorld, setLastWorld] = useState(initialWorldId);

  // 最後に開いた World を覚えておき、Write / Library タブの行き先にする
  if (worldInPath && worldInPath !== lastWorld) setLastWorld(worldInPath);
  useEffect(() => {
    if (!worldInPath) return;
    document.cookie = `${COOKIE}=${worldInPath}; path=${BASE_PATH || '/'}; max-age=31536000; samesite=lax`;
  }, [worldInPath]);

  if (hiddenOn(pathname)) return null;
  const worldId = worldInPath ?? lastWorld;

  const tabs = [
    { label: 'Worlds', href: '/', icon: Globe, active: pathname === '/' },
    {
      label: 'Write',
      href: worldId ? `/w/${worldId}/write` : '/',
      icon: PenLine,
      active: /^\/w\/[^/]+\/(write|episodes)/.test(pathname),
      disabled: !worldId,
    },
    {
      label: 'Library',
      href: worldId ? `/w/${worldId}/library` : '/',
      icon: Book,
      active: /^\/w\/[^/]+\/(library|characters|lore)/.test(pathname),
      disabled: !worldId,
    },
    { label: 'Settings', href: '/settings', icon: SlidersHorizontal, active: pathname.startsWith('/settings') },
  ];

  return (
    <nav
      id="tabbar"
      aria-label="メインメニュー"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bar pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid h-[var(--tabbar-h)] max-w-[640px] grid-cols-4">
        {tabs.map(({ label, href, icon: Icon, active, disabled }) => (
          <li key={label}>
            <Link
              href={href}
              aria-current={active ? 'page' : undefined}
              aria-disabled={disabled || undefined}
              className={cx(
                'flex h-full flex-col items-center justify-center gap-1 text-[11px] leading-none',
                active ? 'font-bold text-accent-ink' : 'text-ink-tab',
                disabled && 'opacity-50',
              )}
            >
              <Icon size={22} strokeWidth={active ? 2 : 1.7} aria-hidden />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
