import 'server-only';
import { and, asc, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import {
  characters,
  episodeCharacters,
  episodeLore,
  episodes,
  generations,
  lore,
  type EpisodeRow,
} from '@/lib/db/schema';
import type { EpisodeKind } from '@/lib/types';
import { getDb } from '../db';
import { newId } from '../ids';
import { touchWorld } from './worlds';

export type EpisodeWithSelection = EpisodeRow & { characterIds: string[]; loreIds: string[] };

export function getEpisode(id: string): EpisodeWithSelection | undefined {
  const db = getDb();
  const row = db.select().from(episodes).where(eq(episodes.id, id)).get();
  if (!row) return undefined;
  const characterIds = db
    .select({ id: episodeCharacters.characterId })
    .from(episodeCharacters)
    .innerJoin(characters, eq(characters.id, episodeCharacters.characterId))
    .where(eq(episodeCharacters.episodeId, id))
    .orderBy(asc(characters.createdAt), sql`"characters".rowid`)
    .all()
    .map((r) => r.id);
  const loreIds = db
    .select({ id: episodeLore.loreId })
    .from(episodeLore)
    .innerJoin(lore, eq(lore.id, episodeLore.loreId))
    .where(eq(episodeLore.episodeId, id))
    .orderBy(asc(lore.createdAt), sql`"lore".rowid`)
    .all()
    .map((r) => r.id);
  return { ...row, characterIds, loreIds };
}

export type EpisodeListItem = EpisodeRow & {
  generationCount: number;
  imageCount: number;
};

export function listEpisodes(worldId: string): EpisodeListItem[] {
  return getDb()
    .select({
      episode: episodes,
      // 相関サブクエリは列名を明示的に修飾する（Drizzle の補間はテーブル名を付けないため）
      generationCount: sql<number>`(select count(*) from generations g where g.episode_id = "episodes"."id")`,
      imageCount: sql<number>`(select count(*) from images i where i.episode_id = "episodes"."id")`,
    })
    .from(episodes)
    .where(eq(episodes.worldId, worldId))
    // 本編（main）を先に、それぞれ新しい順
    .orderBy(asc(episodes.kind), desc(episodes.episodeNumber))
    .all()
    .map((r) => ({ ...r.episode, generationCount: r.generationCount, imageCount: r.imageCount }));
}

/** 本編のうち、指定した番号より前でいちばん新しい話 */
export function previousMainEpisode(worldId: string, episodeNumber: number): EpisodeRow | undefined {
  return getDb()
    .select()
    .from(episodes)
    .where(and(eq(episodes.worldId, worldId), eq(episodes.kind, 'main'), lt(episodes.episodeNumber, episodeNumber)))
    .orderBy(desc(episodes.episodeNumber))
    .limit(1)
    .get();
}

/** 本編の最新話 */
export function latestMainEpisode(worldId: string): EpisodeRow | undefined {
  return getDb()
    .select()
    .from(episodes)
    .where(and(eq(episodes.worldId, worldId), eq(episodes.kind, 'main')))
    .orderBy(desc(episodes.episodeNumber))
    .limit(1)
    .get();
}

/** 要約を保存してある本編の話のうち、いちばん新しいもの（番外編の土台にする） */
export function latestSummarizedMainEpisode(worldId: string): EpisodeRow | undefined {
  return getDb()
    .select()
    .from(episodes)
    .where(and(eq(episodes.worldId, worldId), eq(episodes.kind, 'main'), sql`trim(${episodes.summary}) <> ''`))
    .orderBy(desc(episodes.episodeNumber))
    .limit(1)
    .get();
}

/**
 * 新しい話を作る。
 * - 本編：本編の最新話の保存済み要約を「前回までの要約」に入れ、人物・ロアの選択も引き継ぐ。
 * - 番外編：baseEpisodeId の本編の話（省略時は要約を保存してある本編の最新話、それも無ければ本編の最新話）を
 *   土台にする。番号は本編とは別に振り、番外編の要約は本編へ引き継がない。
 */
export function createEpisode(
  worldId: string,
  kind: EpisodeKind = 'main',
  opts: { baseEpisodeId?: string | null } = {},
): EpisodeRow {
  const db = getDb();
  return db.transaction((tx) => {
    // better-sqlite3 は同じ接続で動くので、ここで呼ぶ関数の読み取りもこのトランザクションに含まれる
    let prev: EpisodeRow | undefined;
    if (kind === 'main') {
      prev = latestMainEpisode(worldId);
    } else if (opts.baseEpisodeId) {
      prev = tx.select().from(episodes).where(eq(episodes.id, opts.baseEpisodeId)).get();
      if (!prev || prev.worldId !== worldId || prev.kind !== 'main') {
        throw new Error('番外編の土台にする本編の話が見つかりません');
      }
    } else {
      prev = latestSummarizedMainEpisode(worldId) ?? latestMainEpisode(worldId);
    }
    const lastOfKind = tx
      .select({ n: sql<number | null>`max(${episodes.episodeNumber})` })
      .from(episodes)
      .where(and(eq(episodes.worldId, worldId), eq(episodes.kind, kind)))
      .get();
    const now = Date.now();
    const row: EpisodeRow = {
      id: newId(),
      worldId,
      kind,
      episodeNumber: (lastOfKind?.n ?? 0) + 1,
      baseEpisodeId: kind === 'side' ? (prev?.id ?? null) : null,
      title: '',
      instruction: '',
      previousSummary: prev?.summary ?? '',
      acceptedGenerationId: null,
      summary: '',
      summaryDraft: null,
      summaryDraftSource: null,
      summaryGenerationId: null,
      writingProviderId: null,
      writingModel: null,
      createdAt: now,
      updatedAt: now,
    };
    tx.insert(episodes).values(row).run();
    if (prev) {
      const chars = tx
        .select({ id: episodeCharacters.characterId })
        .from(episodeCharacters)
        .where(eq(episodeCharacters.episodeId, prev.id))
        .all();
      if (chars.length) {
        tx.insert(episodeCharacters)
          .values(chars.map((c) => ({ episodeId: row.id, characterId: c.id })))
          .run();
      }
      const lores = tx
        .select({ id: episodeLore.loreId })
        .from(episodeLore)
        .where(eq(episodeLore.episodeId, prev.id))
        .all();
      if (lores.length) {
        tx.insert(episodeLore)
          .values(lores.map((l) => ({ episodeId: row.id, loreId: l.id })))
          .run();
      }
    }
    return row;
  });
}

export type EpisodeDraftPatch = {
  title?: string;
  instruction?: string;
  previousSummary?: string;
  characterIds?: string[];
  loreIds?: string[];
  writingProviderId?: string | null;
  writingModel?: string | null;
};

export function updateEpisodeDraft(id: string, patch: EpisodeDraftPatch): EpisodeWithSelection | undefined {
  const db = getDb();
  const ep = db.select().from(episodes).where(eq(episodes.id, id)).get();
  if (!ep) return undefined;
  db.transaction((tx) => {
    const { characterIds, loreIds, ...fields } = patch;
    tx.update(episodes)
      .set({ ...fields, updatedAt: Date.now() })
      .where(eq(episodes.id, id))
      .run();
    if (characterIds) {
      tx.delete(episodeCharacters).where(eq(episodeCharacters.episodeId, id)).run();
      // 他の World の人物が混ざらないように絞り込む
      const valid = characterIds.length
        ? tx
            .select({ id: characters.id })
            .from(characters)
            .where(and(eq(characters.worldId, ep.worldId), inArray(characters.id, characterIds)))
            .all()
        : [];
      if (valid.length) {
        tx.insert(episodeCharacters)
          .values(valid.map((c) => ({ episodeId: id, characterId: c.id })))
          .run();
      }
    }
    if (loreIds) {
      tx.delete(episodeLore).where(eq(episodeLore.episodeId, id)).run();
      const valid = loreIds.length
        ? tx
            .select({ id: lore.id })
            .from(lore)
            .where(and(eq(lore.worldId, ep.worldId), inArray(lore.id, loreIds)))
            .all()
        : [];
      if (valid.length) {
        tx.insert(episodeLore)
          .values(valid.map((l) => ({ episodeId: id, loreId: l.id })))
          .run();
      }
    }
  });
  touchWorld(ep.worldId);
  return getEpisode(id);
}

export function setAccepted(id: string, generationId: string): void {
  getDb()
    .update(episodes)
    .set({ acceptedGenerationId: generationId, updatedAt: Date.now() })
    .where(eq(episodes.id, id))
    .run();
}

/** 要約を確定する（次の Episode へ渡すのはこれだけ） */
export function saveSummary(id: string, summary: string): void {
  getDb()
    .update(episodes)
    .set({ summary, summaryDraft: null, summaryDraftSource: null, updatedAt: Date.now() })
    .where(eq(episodes.id, id))
    .run();
}

export function saveSummaryDraft(
  id: string,
  draft: string,
  source: 'ai' | 'edit',
  generationId?: string | null,
): void {
  getDb()
    .update(episodes)
    .set({
      summaryDraft: draft,
      summaryDraftSource: source,
      ...(generationId !== undefined ? { summaryGenerationId: generationId } : {}),
      updatedAt: Date.now(),
    })
    .where(eq(episodes.id, id))
    .run();
}

export function deleteEpisode(id: string): void {
  getDb().delete(episodes).where(eq(episodes.id, id)).run();
}

/** 本編で次の番号の話（あれば） */
export function nextMainEpisode(worldId: string, episodeNumber: number): EpisodeRow | undefined {
  return getDb()
    .select()
    .from(episodes)
    .where(
      and(eq(episodes.worldId, worldId), eq(episodes.kind, 'main'), sql`${episodes.episodeNumber} > ${episodeNumber}`),
    )
    .orderBy(asc(episodes.episodeNumber))
    .limit(1)
    .get();
}

export type AdoptedText = {
  id: string;
  episodeNumber: number;
  /** 番外編の土台にした本編の話の番号 */
  baseNumber: number | null;
  title: string;
  generationId: string;
  content: string;
  edited: boolean;
};

/** 採用した本文を番号順に（通して読む画面用）。採用していない話は含めない */
export function listAdoptedTexts(worldId: string, kind: EpisodeKind): AdoptedText[] {
  return getDb()
    .select({
      id: episodes.id,
      episodeNumber: episodes.episodeNumber,
      baseNumber: sql<number | null>`(select b.episode_number from episodes b where b.id = "episodes"."base_episode_id")`,
      title: episodes.title,
      generationId: generations.id,
      content: generations.content,
      editedAt: generations.editedAt,
    })
    .from(episodes)
    .innerJoin(generations, eq(generations.id, episodes.acceptedGenerationId))
    .where(and(eq(episodes.worldId, worldId), eq(episodes.kind, kind)))
    .orderBy(asc(episodes.episodeNumber))
    .all()
    .map(({ editedAt, ...r }) => ({ ...r, edited: editedAt !== null }));
}

/** 採用済みの話の数（本編・番外編それぞれ） */
export function countAdopted(worldId: string): Record<EpisodeKind, number> {
  const rows = getDb()
    .select({ kind: episodes.kind, n: sql<number>`count(*)` })
    .from(episodes)
    .where(and(eq(episodes.worldId, worldId), sql`${episodes.acceptedGenerationId} is not null`))
    .groupBy(episodes.kind)
    .all();
  const out: Record<EpisodeKind, number> = { main: 0, side: 0 };
  for (const r of rows) out[r.kind] = r.n;
  return out;
}

export function clearSummaryDraft(id: string): void {
  getDb()
    .update(episodes)
    .set({ summaryDraft: null, summaryDraftSource: null, updatedAt: Date.now() })
    .where(eq(episodes.id, id))
    .run();
}
