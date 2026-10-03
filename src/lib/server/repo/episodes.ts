import 'server-only';
import { and, asc, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import {
  characters,
  episodeCharacters,
  episodeLore,
  episodes,
  lore,
  type EpisodeRow,
} from '@/lib/db/schema';
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
    .orderBy(desc(episodes.episodeNumber))
    .all()
    .map((r) => ({ ...r.episode, generationCount: r.generationCount, imageCount: r.imageCount }));
}

/** 指定した番号より前で、いちばん新しい Episode */
export function previousEpisode(worldId: string, episodeNumber: number): EpisodeRow | undefined {
  return getDb()
    .select()
    .from(episodes)
    .where(and(eq(episodes.worldId, worldId), lt(episodes.episodeNumber, episodeNumber)))
    .orderBy(desc(episodes.episodeNumber))
    .limit(1)
    .get();
}

/**
 * 次の Episode を作る。前の Episode の保存済み要約を「前回までの要約」に入れ、
 * 人物・ロアの選択も引き継ぐ。
 */
export function createEpisode(worldId: string): EpisodeRow {
  const db = getDb();
  return db.transaction((tx) => {
    const prev = tx
      .select()
      .from(episodes)
      .where(eq(episodes.worldId, worldId))
      .orderBy(desc(episodes.episodeNumber))
      .limit(1)
      .get();
    const now = Date.now();
    const row: EpisodeRow = {
      id: newId(),
      worldId,
      episodeNumber: (prev?.episodeNumber ?? 0) + 1,
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

/** 次の番号の Episode（あれば） */
export function nextEpisode(worldId: string, episodeNumber: number): EpisodeRow | undefined {
  return getDb()
    .select()
    .from(episodes)
    .where(and(eq(episodes.worldId, worldId), sql`${episodes.episodeNumber} > ${episodeNumber}`))
    .orderBy(asc(episodes.episodeNumber))
    .limit(1)
    .get();
}

export function clearSummaryDraft(id: string): void {
  getDb()
    .update(episodes)
    .set({ summaryDraft: null, summaryDraftSource: null, updatedAt: Date.now() })
    .where(eq(episodes.id, id))
    .run();
}
