import 'server-only';
import { desc, eq, inArray, sql } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';
import { episodes, images, type ImageRow } from '@/lib/db/schema';
import type { EpisodeKind, ImageView } from '@/lib/types';
import { getDb } from '../db';
import { dataDir } from '../paths';

export function toImageView(row: ImageRow): ImageView {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
  return {
    id: row.id,
    episodeId: row.episodeId,
    generationId: row.generationId,
    provider: row.provider,
    model: row.model,
    prompt: row.prompt,
    instruction: row.instruction,
    createdAt: row.createdAt,
    url: `${base}/api/images/${row.id}/file`,
    thumbUrl: `${base}/api/images/${row.id}/file${row.thumbPath ? '?thumb=1' : ''}`,
  };
}

export function listEpisodeImages(episodeId: string): ImageRow[] {
  return getDb().select().from(images).where(eq(images.episodeId, episodeId)).orderBy(desc(images.createdAt), sql`"images".rowid desc`).all();
}

export function listWorldImages(
  worldId: string,
): (ImageRow & { episodeKind: EpisodeKind; episodeNumber: number; episodeTitle: string })[] {
  return getDb()
    .select({
      image: images,
      episodeKind: episodes.kind,
      episodeNumber: episodes.episodeNumber,
      episodeTitle: episodes.title,
    })
    .from(images)
    .innerJoin(episodes, eq(episodes.id, images.episodeId))
    .where(eq(episodes.worldId, worldId))
    .orderBy(desc(images.createdAt), sql`"images".rowid desc`)
    .all()
    .map((r) => ({
      ...r.image,
      episodeKind: r.episodeKind,
      episodeNumber: r.episodeNumber,
      episodeTitle: r.episodeTitle,
    }));
}

export function getImage(id: string): ImageRow | undefined {
  return getDb().select().from(images).where(eq(images.id, id)).get();
}

export function insertImage(row: ImageRow): void {
  getDb().insert(images).values(row).run();
}

/** DATA_DIR の外を指すパスは扱わない */
export function resolveDataPath(rel: string): string | null {
  const root = dataDir();
  const abs = path.resolve(root, rel);
  return abs.startsWith(root + path.sep) ? abs : null;
}

function unlinkQuietly(rel: string | null): void {
  if (!rel) return;
  const abs = resolveDataPath(rel);
  if (!abs) return;
  try {
    fs.unlinkSync(abs);
  } catch {
    // 既に無い場合は無視
  }
}

export function deleteImage(id: string): void {
  const row = getImage(id);
  if (!row) return;
  getDb().delete(images).where(eq(images.id, id)).run();
  unlinkQuietly(row.filePath);
  unlinkQuietly(row.thumbPath);
}

/** Episode / World を消す前に、紐づく画像ファイルを消す（行は外部キーの cascade で消える） */
export function deleteImageFilesForEpisodes(episodeIds: string[]): void {
  if (episodeIds.length === 0) return;
  const rows = getDb().select().from(images).where(inArray(images.episodeId, episodeIds)).all();
  for (const row of rows) {
    unlinkQuietly(row.filePath);
    unlinkQuietly(row.thumbPath);
  }
}
