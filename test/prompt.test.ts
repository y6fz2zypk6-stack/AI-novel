import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildContext,
  buildSummaryMessages,
  cleanImagePrompt,
  contextFromSnapshot,
  NO_INSTRUCTION_TEXT,
  OUTPUT_INSTRUCTION,
  SYSTEM_INSTRUCTION,
  toParagraphs,
} from '../src/lib/prompt';
import { countChars, estimateTokens } from '../src/lib/tokens';

const base = {
  worldInstruction: '三人称一元視点。',
  characters: [
    { name: '佐倉ミナ', content: '19歳。' },
    { name: '朝倉レン', content: '同級生。' },
  ],
  lore: [{ title: '白ヶ丘高校', content: '創立80年。' }],
  previousSummary: 'ミナは鍵を拾った。',
  episodeNumber: 12,
  episodeTitle: '雨の屋上',
  episodeInstruction: '屋上で会話する。',
};

describe('buildContext（機能仕様 §10 の順序）', () => {
  it('7つのセクションを仕様の順に並べる', () => {
    const ctx = buildContext(base);
    assert.deepEqual(
      ctx.sections.map((s) => s.key),
      ['system', 'world', 'characters', 'lore', 'previous', 'instruction', 'output'],
    );
    assert.equal(ctx.messages.length, 2);
    assert.equal(ctx.messages[0].role, 'system');
    assert.match(ctx.messages[0].content, /^\[SYSTEM\]/);
    assert.match(ctx.messages[0].content, /\[WORLD INSTRUCTION\]\n三人称一元視点。/);
    const user = ctx.messages[1].content;
    const order = ['[CHARACTERS]', '[LORE]', '[PREVIOUS STORY]', '[CURRENT INSTRUCTION]', '[OUTPUT]'].map((k) =>
      user.indexOf(k),
    );
    assert.ok(order.every((v, i) => v >= 0 && (i === 0 || v > order[i - 1])), `順序: ${order}`);
    assert.match(user, /## 佐倉ミナ\n19歳。/);
    assert.match(user, /エピソード：第12話「雨の屋上」/);
    assert.equal(ctx.sections.find((s) => s.key === 'characters')?.count, 2);
  });

  it('空のセクションは送らない', () => {
    const ctx = buildContext({ ...base, worldInstruction: ' ', characters: [], lore: [], previousSummary: '' });
    assert.deepEqual(
      ctx.sections.map((s) => s.key),
      ['system', 'instruction', 'output'],
    );
    assert.ok(!ctx.messages[1].content.includes('[CHARACTERS]'));
  });

  it('今回の指示が空なら、続きを書く旨の指示を入れる', () => {
    const ctx = buildContext({ ...base, episodeInstruction: '' });
    assert.ok(ctx.messages[1].content.includes(NO_INSTRUCTION_TEXT));
  });

  it('修正指示付き再生成は、元の本文と修正指示をメッセージに足す', () => {
    const ctx = buildContext({ ...base, revision: { baseContent: '元の本文', note: '会話を増やす' } });
    assert.deepEqual(
      ctx.messages.map((m) => m.role),
      ['system', 'user', 'assistant', 'user'],
    );
    assert.equal(ctx.messages[2].content, '元の本文');
    assert.match(ctx.messages[3].content, /^\[REVISION\][\s\S]*会話を増やす$/);
  });

  it('合計は各セクションの和。全文は送るメッセージそのもの', () => {
    const ctx = buildContext(base);
    assert.equal(
      ctx.totalTokens,
      ctx.sections.reduce((a, s) => a + s.tokens, 0),
    );
    for (const m of ctx.messages) assert.ok(ctx.fullText.includes(m.content));
  });

  it('Snapshot から組み立て直すと、当時のメッセージと同じ内容になる', () => {
    const ctx = buildContext(base);
    const rebuilt = contextFromSnapshot({
      ...base,
      systemInstruction: SYSTEM_INSTRUCTION,
      outputInstruction: OUTPUT_INSTRUCTION,
      revision: null,
      messages: ctx.messages,
    });
    assert.equal(rebuilt.fullText, ctx.fullText);
    assert.deepEqual(
      rebuilt.sections.map((s) => s.tokens),
      ctx.sections.map((s) => s.tokens),
    );
  });

  it('Snapshot は当時の System 文言を使う', () => {
    const old = contextFromSnapshot({
      ...base,
      systemInstruction: '古いシステム指示',
      outputInstruction: '古い出力指示',
      revision: null,
      messages: [],
    });
    assert.equal(old.sections[0].text, '[SYSTEM]\n古いシステム指示');
  });
});

describe('要約・画像 Prompt', () => {
  it('前回までの要約があれば引き継いで1つにまとめるよう指示する', () => {
    const msgs = buildSummaryMessages({ episodeNumber: 3, episodeTitle: '', previousSummary: '前の要約', text: '本文' });
    assert.match(msgs[1].content, /\[これまでの要約\]\n前の要約/);
    assert.match(msgs[1].content, /未回収の伏線/);
    assert.match(msgs[1].content, /\[今回の本文：第3話\]\n本文$/);
  });

  it('最初の話では「これまでの要約」を入れない', () => {
    const msgs = buildSummaryMessages({ episodeNumber: 1, episodeTitle: 'a', previousSummary: '', text: '本文' });
    assert.ok(!msgs[1].content.includes('これまでの要約'));
    assert.ok(!msgs[1].content.includes('\n\n\n'));
  });

  it('画像 Prompt の前置きや引用符を取り除く', () => {
    assert.equal(cleanImagePrompt('```\nPrompt: "A girl on a rooftop"\n```'), 'A girl on a rooftop');
    assert.equal(cleanImagePrompt('  A cat.  '), 'A cat.');
  });
});

describe('本文の段落分け（デザイン仕様 §10）', () => {
  it('「『 で始まる行は会話、それ以外は地の文。全角スペースの字下げは外す', () => {
    const ps = toParagraphs('　地の文です。\n\n「会話」\n『手紙』\n◇\n次の場面');
    assert.deepEqual(
      ps.map((p) => [p.kind, p.text]),
      [
        ['narration', '地の文です。'],
        ['dialogue', '「会話」'],
        ['dialogue', '『手紙』'],
        ['break', '◇'],
        ['narration', '次の場面'],
      ],
    );
  });
});

describe('トークン数の推定', () => {
  it('日本語は1文字≒1トークン、英語は4文字≒1トークン', () => {
    assert.equal(estimateTokens(''), 0);
    assert.equal(estimateTokens('あいうえお'), 5);
    assert.equal(estimateTokens('abcdefgh'), 2);
    assert.equal(estimateTokens('漢字abcd'), 3);
  });

  it('文字数は改行を数えない', () => {
    assert.equal(countChars('あい\nう'), 3);
    assert.equal(countChars('𠮷'), 1);
  });
});
