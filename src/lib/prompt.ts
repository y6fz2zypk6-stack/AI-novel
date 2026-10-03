// プロンプトの組み立て（機能仕様 §10）。
// 画面の Context Preview とサーバーの本文生成が同じ関数を使うので、
// プレビューに出た内容がそのまま Provider へ送られる。

import { countChars, estimateTokens } from './tokens';
import type { ChatMessage } from './types';

export const SYSTEM_INSTRUCTION = [
  'あなたは日本語の小説を書く作家です。',
  '与えられた世界観の執筆指示・登場人物・設定（ロア）・これまでのあらすじを踏まえ、指示されたエピソードの本文を書きます。',
  '設定やこれまでの出来事と矛盾する描写はしないでください。',
].join('\n');

export const OUTPUT_INSTRUCTION = [
  '上記の設定を守り、今回の指示に沿って、このエピソードの日本語小説本文を書いてください。',
  '本文だけを出力してください。タイトル・見出し・前置き・あとがき・注釈は書かないでください。',
  '段落ごとに改行してください。',
].join('\n');

export const NO_INSTRUCTION_TEXT = '（特別な指示はありません。これまでの続きを自然に書いてください。）';

export type ContextInput = {
  worldInstruction: string;
  characters: { name: string; content: string }[];
  lore: { title: string; content: string }[];
  previousSummary: string;
  episodeNumber: number;
  episodeTitle: string;
  episodeInstruction: string;
  /** 修正指示付き再生成のとき */
  revision?: { baseContent: string; note: string } | null;
  /** Snapshot から組み立て直すときに、当時の文言を使う */
  systemInstruction?: string;
  outputInstruction?: string;
};

export type SectionKey =
  | 'system'
  | 'world'
  | 'characters'
  | 'lore'
  | 'previous'
  | 'instruction'
  | 'output'
  | 'revisionBase'
  | 'revisionNote';

export type ContextSection = {
  key: SectionKey;
  label: string;
  /** 人物・ロアの件数 */
  count?: number;
  text: string;
  tokens: number;
  chars: number;
};

export type BuiltContext = {
  sections: ContextSection[];
  messages: ChatMessage[];
  fullText: string;
  totalTokens: number;
  totalChars: number;
};

const SEP = '\n\n---\n\n';

function section(key: SectionKey, label: string, text: string, count?: number): ContextSection {
  return { key, label, count, text, tokens: estimateTokens(text), chars: countChars(text) };
}

function entries(items: { heading: string; content: string }[]): string {
  return items.map((it) => `## ${it.heading.trim() || '（無題）'}\n${it.content.trim()}`).join('\n\n');
}

export function buildContext(input: ContextInput): BuiltContext {
  const sections: ContextSection[] = [];

  sections.push(section('system', 'System', `[SYSTEM]\n${input.systemInstruction ?? SYSTEM_INSTRUCTION}`));

  const world = input.worldInstruction.trim();
  if (world) sections.push(section('world', 'World基礎指示', `[WORLD INSTRUCTION]\n${world}`));

  if (input.characters.length > 0) {
    const body = entries(input.characters.map((c) => ({ heading: c.name, content: c.content })));
    sections.push(section('characters', '登場人物', `[CHARACTERS]\n\n${body}`, input.characters.length));
  }

  if (input.lore.length > 0) {
    const body = entries(input.lore.map((l) => ({ heading: l.title, content: l.content })));
    sections.push(section('lore', 'ロア', `[LORE]\n\n${body}`, input.lore.length));
  }

  const previous = input.previousSummary.trim();
  if (previous) {
    sections.push(
      section('previous', '前回までの要約', `[PREVIOUS STORY]\n前回までに以下の出来事が発生した。\n\n${previous}`),
    );
  }

  const title = input.episodeTitle.trim();
  const heading = `エピソード：第${input.episodeNumber}話${title ? `「${title}」` : ''}`;
  const instruction = input.episodeInstruction.trim() || NO_INSTRUCTION_TEXT;
  sections.push(
    section('instruction', '今回の指示', `[CURRENT INSTRUCTION]\n${heading}\n\n${instruction}`),
  );

  sections.push(section('output', '出力指示', `[OUTPUT]\n${input.outputInstruction ?? OUTPUT_INSTRUCTION}`));

  const systemKeys: SectionKey[] = ['system', 'world'];
  const systemText = sections
    .filter((s) => systemKeys.includes(s.key))
    .map((s) => s.text)
    .join(SEP);
  const userText = sections
    .filter((s) => !systemKeys.includes(s.key))
    .map((s) => s.text)
    .join(SEP);

  const messages: ChatMessage[] = [
    { role: 'system', content: systemText },
    { role: 'user', content: userText },
  ];

  if (input.revision) {
    const base = input.revision.baseContent;
    const note = input.revision.note.trim();
    const revisionText = [
      '[REVISION]',
      '直前の本文を、次の修正指示に従って全文書き直してください。',
      '修正指示で触れていない部分の展開や設定は保ってください。本文だけを出力してください。',
      '',
      '修正指示：',
      note,
    ].join('\n');
    sections.push(section('revisionBase', '修正前の本文', base));
    sections.push(section('revisionNote', '修正指示', revisionText));
    messages.push({ role: 'assistant', content: base });
    messages.push({ role: 'user', content: revisionText });
  }

  const fullText = messages.map((m) => `=== ${m.role} ===\n${m.content}`).join('\n\n');
  return {
    sections,
    messages,
    fullText,
    totalTokens: sections.reduce((a, s) => a + s.tokens, 0),
    totalChars: sections.reduce((a, s) => a + s.chars, 0),
  };
}

// ---- 要約（機能仕様 §15） ----

export function buildSummaryMessages(input: {
  episodeNumber: number;
  episodeTitle: string;
  previousSummary: string;
  text: string;
}): ChatMessage[] {
  const title = input.episodeTitle.trim();
  const previous = input.previousSummary.trim();
  const user = [
    '以下の小説本文を、次のエピソードを書くAIが必要とする情報だけに整理してください。',
    previous
      ? '「これまでの要約」のうち今後も必要な情報は引き継ぎ、今回の本文で変わった情報は更新して、1つの要約にまとめてください。'
      : '',
    '',
    '必ず以下を含めてください。',
    '',
    '- 起きた出来事',
    '- キャラクター間の関係変化',
    '- 新しく判明した情報',
    '- 現在の場所・状況',
    '- 未回収の伏線',
    '- 持ち物',
    '- 負傷',
    '- 約束',
    '- キャラクターの認識変化',
    '- その他、次話の整合性に必要な事項',
    '',
    '文学的な文章ではなく、AIが次話を書くための実用的な情報としてまとめてください。',
    '項目ごとに見出しと箇条書きで書き、該当がない項目は「なし」と書いてください。要約だけを出力してください。',
    '',
    ...(previous ? ['[これまでの要約]', previous, ''] : []),
    `[今回の本文：第${input.episodeNumber}話${title ? `「${title}」` : ''}]`,
    input.text.trim(),
  ]
    .filter((line, i, all) => !(line === '' && all[i - 1] === ''))
    .join('\n');
  return [
    {
      role: 'system',
      content:
        'あなたは連載小説の編集者です。次のエピソードを書くAIのために、物語を続けるのに必要な情報を正確に整理します。',
    },
    { role: 'user', content: user },
  ];
}

// ---- スチル画像の Prompt 作成（機能仕様 §21） ----

export function buildImagePromptMessages(input: {
  characters: { name: string; content: string }[];
  text: string;
  instruction: string;
}): ChatMessage[] {
  const parts = [
    '次の小説本文から、挿絵（スチル画像）1枚を生成するための画像生成プロンプトを英語で書いてください。',
    '',
    '- 本文の中で最も印象的な一場面を選ぶ',
    '- 登場人物の外見（年齢感・髪型・髪色・服装）、表情、ポーズ、場所、時間帯、天候、光、構図を具体的に書く',
    '- 縦長（3:4）の構図にする',
    '- 画像の中に文字を入れない',
    '- 追加指示があれば必ず反映する',
    '- プロンプト本文だけを1段落で出力する（前置き・説明・引用符は不要）',
  ];
  const instruction = input.instruction.trim();
  if (instruction) parts.push('', '[追加指示]', instruction);
  if (input.characters.length > 0) {
    parts.push('', '[登場人物の設定]', entries(input.characters.map((c) => ({ heading: c.name, content: c.content }))));
  }
  parts.push('', '[本文]', input.text.trim());
  return [
    {
      role: 'system',
      content: 'You write concise, vivid prompts for image generation models.',
    },
    { role: 'user', content: parts.join('\n') },
  ];
}

/** LLM が返した画像 Prompt から、コードフェンスや引用符を取り除く */
export function cleanImagePrompt(raw: string): string {
  return raw
    .replace(/^```[a-z]*\s*/i, '')
    .replace(/```\s*$/, '')
    .replace(/^\s*(prompt|プロンプト)\s*[:：]\s*/i, '')
    .trim()
    .replace(/^["“「]+|["”」]+$/g, '')
    .trim();
}

// ---- 本文の表示（デザイン仕様 §10） ----

export type Paragraph = { text: string; kind: 'narration' | 'dialogue' | 'break' };

export function toParagraphs(text: string): Paragraph[] {
  const out: Paragraph[] = [];
  for (const raw of text.split(/\r?\n/)) {
    // 全角スペースで字下げされている場合は外す（CSS で字下げするため）
    const line = raw.replace(/^[ 　]+/, '').trimEnd();
    if (!line) continue;
    if (/^[「『]/.test(line)) out.push({ text: line, kind: 'dialogue' });
    else if (/^[\s◇◆□■＊*※・―─\-]+$/.test(line)) out.push({ text: line, kind: 'break' });
    else out.push({ text: line, kind: 'narration' });
  }
  return out;
}

/** Prompt Snapshot から Context Preview 用の表示を組み立て直す */
export function contextFromSnapshot(snap: {
  systemInstruction: string;
  worldInstruction: string;
  characters: { name: string; content: string }[];
  lore: { title: string; content: string }[];
  previousSummary: string;
  episodeNumber: number;
  episodeTitle: string;
  episodeInstruction: string;
  outputInstruction: string;
  revision: { baseContent: string; note: string } | null;
  messages: ChatMessage[];
}): BuiltContext {
  const built = buildContext(snap);
  // 全文は実際に送ったメッセージをそのまま出す
  const fullText = snap.messages.map((m) => `=== ${m.role} ===\n${m.content}`).join('\n\n');
  return { ...built, messages: snap.messages, fullText };
}
