import 'server-only';
import path from 'node:path';

// 実行時に決まるパス。ビルド時のファイル追跡（standalone 出力）の対象から外す

/** SQLite・画像・暗号鍵の置き場所。Docker では /data をマウントする */
export function dataDir(): string {
  return path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR || './data');
}

export function dbPath(): string {
  return path.join(/*turbopackIgnore: true*/ dataDir(), 'app.sqlite');
}

export function imagesDir(): string {
  return path.join(/*turbopackIgnore: true*/ dataDir(), 'images');
}

export function migrationsDir(): string {
  return path.resolve(
    /*turbopackIgnore: true*/ process.env.MIGRATIONS_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), 'drizzle'),
  );
}
