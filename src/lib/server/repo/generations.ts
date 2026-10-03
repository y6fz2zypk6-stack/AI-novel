import 'server-only';
import { asc, count, eq, sql } from 'drizzle-orm';
import { generations, type GenerationRow } from '@/lib/db/schema';
import type { GenerationView } from '@/lib/types';
import { getDb } from '../db';

export function getGeneration(id: string): GenerationRow | undefined {
  return getDb().select().from(generations).where(eq(generations.id, id)).get();
}

export function toGenerationView(row: GenerationRow): GenerationView {
  return {
    id: row.id,
    provider: row.provider,
    model: row.model,
    content: row.content,
    status: row.status,
    error: row.error,
    finishReason: row.finishReason,
    usage: row.usage ?? null,
    settings: row.generationSettings,
    revisionOf: row.revisionOf,
    revisionNote: row.revisionNote,
    createdAt: row.createdAt,
    finishedAt: row.finishedAt,
  };
}

/** 候補一覧（Snapshot を除く） */
export function listGenerations(episodeId: string): GenerationRow[] {
  return getDb()
    .select()
    .from(generations)
    .where(eq(generations.episodeId, episodeId))
    .orderBy(asc(generations.createdAt), sql`"generations".rowid`)
    .all();
}

export function insertGeneration(row: GenerationRow): void {
  getDb().insert(generations).values(row).run();
}

export function updateGeneration(
  id: string,
  patch: Partial<Pick<GenerationRow, 'content' | 'status' | 'error' | 'finishReason' | 'usage' | 'finishedAt'>>,
): void {
  getDb().update(generations).set(patch).where(eq(generations.id, id)).run();
}

export function countGenerations(episodeId: string): number {
  return getDb().select({ n: count() }).from(generations).where(eq(generations.episodeId, episodeId)).get()?.n ?? 0;
}
