import 'server-only';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import fs from 'node:fs';
import * as schema from '../db/schema';
import { newId } from './ids';
import { dataDir, dbPath, imagesDir, migrationsDir } from './paths';

export type Db = BetterSQLite3Database<typeof schema>;

const g = globalThis as unknown as { __novelDb?: Db };

/** 最初の呼び出しで DB を開き、マイグレーションと初期データ投入を行う */
export function getDb(): Db {
  if (g.__novelDb) return g.__novelDb;
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.mkdirSync(imagesDir(), { recursive: true });
  const sqlite = new Database(dbPath());
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: migrationsDir() });
  seed(db);
  g.__novelDb = db;
  return db;
}

export const DEFAULT_SETTINGS = {
  temperature: 0.8,
  maxTokens: 8000,
} as const;

function seed(db: Db): void {
  const hasProvider = db.select({ id: schema.providerSettings.id }).from(schema.providerSettings).get();
  if (hasProvider) return;
  const now = Date.now();
  const id = newId();
  db.insert(schema.providerSettings)
    .values({
      id,
      name: 'OpenRouter',
      providerType: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      encryptedApiKey: null,
      defaultTextModel: 'anthropic/claude-opus-5.5',
      defaultSummaryModel: 'anthropic/claude-sonnet-5.5',
      defaultImageModel: '',
      createdAt: now,
      updatedAt: now,
    })
    .run();
  const defaults: Record<string, unknown> = {
    writingProviderId: id,
    summaryProviderId: id,
    imageProviderId: id,
    temperature: DEFAULT_SETTINGS.temperature,
    maxTokens: DEFAULT_SETTINGS.maxTokens,
  };
  for (const [key, value] of Object.entries(defaults)) {
    db.insert(schema.appSettings).values({ key, value }).onConflictDoNothing().run();
  }
}
