import 'server-only';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { characters, episodes, lore, worlds, type CharacterRow, type LoreRow, type WorldRow } from '@/lib/db/schema';
import { getDb } from '../db';
import { newId } from '../ids';

export type WorldListItem = WorldRow & {
  latestEpisodeNumber: number | null;
  characterCount: number;
  loreCount: number;
  lastActivityAt: number;
};

export function listWorlds(): WorldListItem[] {
  const db = getDb();
  const rows = db
    .select({
      world: worlds,
      // 相関サブクエリは列名を明示的に修飾する（Drizzle の補間はテーブル名を付けないため）
      latestEpisodeNumber: sql<number | null>`(select max(e.episode_number) from episodes e where e.world_id = "worlds"."id")`,
      episodeActivity: sql<number | null>`(select max(e.updated_at) from episodes e where e.world_id = "worlds"."id")`,
      characterCount: sql<number>`(select count(*) from characters c where c.world_id = "worlds"."id")`,
      loreCount: sql<number>`(select count(*) from lore l where l.world_id = "worlds"."id")`,
    })
    .from(worlds)
    .all();
  return rows
    .map((r) => ({
      ...r.world,
      latestEpisodeNumber: r.latestEpisodeNumber,
      characterCount: r.characterCount,
      loreCount: r.loreCount,
      lastActivityAt: Math.max(r.world.updatedAt, r.episodeActivity ?? 0),
    }))
    .sort((a, b) => b.lastActivityAt - a.lastActivityAt);
}

export function getWorld(id: string): WorldRow | undefined {
  return getDb().select().from(worlds).where(eq(worlds.id, id)).get();
}

export function createWorld(input: { name: string; description: string; baseInstruction: string }): WorldRow {
  const now = Date.now();
  const row: WorldRow = { id: newId(), ...input, createdAt: now, updatedAt: now };
  getDb().insert(worlds).values(row).run();
  return row;
}

export function updateWorld(
  id: string,
  patch: Partial<Pick<WorldRow, 'name' | 'description' | 'baseInstruction'>>,
): WorldRow | undefined {
  getDb()
    .update(worlds)
    .set({ ...patch, updatedAt: Date.now() })
    .where(eq(worlds.id, id))
    .run();
  return getWorld(id);
}

export function deleteWorld(id: string): void {
  getDb().delete(worlds).where(eq(worlds.id, id)).run();
}

export function touchWorld(id: string): void {
  getDb().update(worlds).set({ updatedAt: Date.now() }).where(eq(worlds.id, id)).run();
}

// ---- Characters ----

export function listCharacters(worldId: string): CharacterRow[] {
  return getDb()
    .select()
    .from(characters)
    .where(eq(characters.worldId, worldId))
    .orderBy(asc(characters.createdAt), sql`"characters".rowid`)
    .all();
}

export function getCharacter(id: string): CharacterRow | undefined {
  return getDb().select().from(characters).where(eq(characters.id, id)).get();
}

export function createCharacter(worldId: string, input: { name: string; content: string }): CharacterRow {
  const now = Date.now();
  const row: CharacterRow = { id: newId(), worldId, ...input, createdAt: now, updatedAt: now };
  getDb().insert(characters).values(row).run();
  touchWorld(worldId);
  return row;
}

export function updateCharacter(
  id: string,
  patch: Partial<Pick<CharacterRow, 'name' | 'content'>>,
): CharacterRow | undefined {
  getDb()
    .update(characters)
    .set({ ...patch, updatedAt: Date.now() })
    .where(eq(characters.id, id))
    .run();
  const row = getCharacter(id);
  if (row) touchWorld(row.worldId);
  return row;
}

export function deleteCharacter(id: string): void {
  getDb().delete(characters).where(eq(characters.id, id)).run();
}

// ---- Lore ----

export function listLore(worldId: string): LoreRow[] {
  return getDb().select().from(lore).where(eq(lore.worldId, worldId)).orderBy(asc(lore.createdAt), sql`"lore".rowid`).all();
}

export function getLore(id: string): LoreRow | undefined {
  return getDb().select().from(lore).where(eq(lore.id, id)).get();
}

export function createLore(worldId: string, input: { title: string; content: string }): LoreRow {
  const now = Date.now();
  const row: LoreRow = { id: newId(), worldId, ...input, createdAt: now, updatedAt: now };
  getDb().insert(lore).values(row).run();
  touchWorld(worldId);
  return row;
}

export function updateLore(id: string, patch: Partial<Pick<LoreRow, 'title' | 'content'>>): LoreRow | undefined {
  getDb()
    .update(lore)
    .set({ ...patch, updatedAt: Date.now() })
    .where(eq(lore.id, id))
    .run();
  const row = getLore(id);
  if (row) touchWorld(row.worldId);
  return row;
}

export function deleteLore(id: string): void {
  getDb().delete(lore).where(eq(lore.id, id)).run();
}

/** World 内の最新 Episode（番号が最大のもの） */
export function latestEpisodeId(worldId: string): string | undefined {
  return getDb()
    .select({ id: episodes.id })
    .from(episodes)
    .where(and(eq(episodes.worldId, worldId)))
    .orderBy(desc(episodes.episodeNumber))
    .limit(1)
    .get()?.id;
}
