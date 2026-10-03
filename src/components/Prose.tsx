import { toParagraphs } from '@/lib/prompt';
import { cx } from './ui';

/**
 * 生成本文の表示（明朝・行間1.9）。
 * 「『 で始まる段落は字下げせず、地の文は1字下げる（デザイン仕様 §2.2 / §10）。
 */
export function Prose({ text, className }: { text: string; className?: string }) {
  const paragraphs = toParagraphs(text);
  return (
    <div className={cx('prose-jp', className)}>
      {paragraphs.map((p, i) => (
        <p key={i} className={p.kind === 'dialogue' ? undefined : p.kind}>
          {p.text}
        </p>
      ))}
    </div>
  );
}
