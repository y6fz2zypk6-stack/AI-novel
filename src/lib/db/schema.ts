import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';
import type { GenerationSettings, PromptSnapshot, Usage } from '../types';

// 日時はすべて Unix ミリ秒（integer）で持つ

export const worlds = sqliteTable('worlds', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  baseInstruction: text('base_instruction').notNull().default(''),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const characters = sqliteTable(
  'characters',
  {
    id: text('id').primaryKey(),
    worldId: text('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    content: text('content').notNull().default(''),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('characters_world_idx').on(t.worldId)],
);

export const lore = sqliteTable(
  'lore',
  {
    id: text('id').primaryKey(),
    worldId: text('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    content: text('content').notNull().default(''),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('lore_world_idx').on(t.worldId)],
);

export const episodes = sqliteTable(
  'episodes',
  {
    id: text('id').primaryKey(),
    worldId: text('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    episodeNumber: integer('episode_number').notNull(),
    title: text('title').notNull().default(''),
    instruction: text('instruction').notNull().default(''),
    previousSummary: text('previous_summary').notNull().default(''),
    acceptedGenerationId: text('accepted_generation_id').references(
      (): AnySQLiteColumn => generations.id,
      { onDelete: 'set null' },
    ),
    /** 保存済み（確定）の次話用要約。次のEpisodeへ渡すのはこれだけ */
    summary: text('summary').notNull().default(''),
    /** 未保存の要約（AI生成または編集中）。null なら未保存の変更なし */
    summaryDraft: text('summary_draft'),
    /** summaryDraft の出どころ。'ai' = AIが生成したまま / 'edit' = 手で編集した */
    summaryDraftSource: text('summary_draft_source', { enum: ['ai', 'edit'] }),
    /** 要約（下書き含む）を生成したときの元になった Generation */
    summaryGenerationId: text('summary_generation_id'),
    /** このEpisodeだけ既定と別のモデルで書く場合（null なら既定） */
    writingProviderId: text('writing_provider_id'),
    writingModel: text('writing_model'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [uniqueIndex('episodes_world_number_uq').on(t.worldId, t.episodeNumber)],
);

export const episodeCharacters = sqliteTable(
  'episode_characters',
  {
    episodeId: text('episode_id')
      .notNull()
      .references(() => episodes.id, { onDelete: 'cascade' }),
    characterId: text('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.episodeId, t.characterId] })],
);

export const episodeLore = sqliteTable(
  'episode_lore',
  {
    episodeId: text('episode_id')
      .notNull()
      .references(() => episodes.id, { onDelete: 'cascade' }),
    loreId: text('lore_id')
      .notNull()
      .references(() => lore.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.episodeId, t.loreId] })],
);

export const generations = sqliteTable(
  'generations',
  {
    id: text('id').primaryKey(),
    episodeId: text('episode_id')
      .notNull()
      .references(() => episodes.id, { onDelete: 'cascade' }),
    /** 生成時点の Provider 名（Provider を後で消しても表示できるように） */
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    content: text('content').notNull().default(''),
    /** 生成時点のコンテキスト一式。作成後は変更しない */
    promptSnapshot: text('prompt_snapshot', { mode: 'json' }).$type<PromptSnapshot>().notNull(),
    generationSettings: text('generation_settings', { mode: 'json' })
      .$type<GenerationSettings>()
      .notNull(),
    status: text('status', { enum: ['generating', 'done', 'error', 'stopped'] }).notNull(),
    error: text('error'),
    finishReason: text('finish_reason'),
    usage: text('usage', { mode: 'json' }).$type<Usage>(),
    /** 修正指示付き再生成の元になった Generation */
    revisionOf: text('revision_of'),
    revisionNote: text('revision_note'),
    createdAt: integer('created_at').notNull(),
    finishedAt: integer('finished_at'),
  },
  (t) => [index('generations_episode_idx').on(t.episodeId, t.createdAt)],
);

export const images = sqliteTable(
  'images',
  {
    id: text('id').primaryKey(),
    episodeId: text('episode_id')
      .notNull()
      .references(() => episodes.id, { onDelete: 'cascade' }),
    generationId: text('generation_id').references(() => generations.id, {
      onDelete: 'set null',
    }),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    /** 画像モデルへ実際に渡した Prompt */
    prompt: text('prompt').notNull(),
    /** ユーザーが入力した追加指示 */
    instruction: text('instruction').notNull().default(''),
    /** DATA_DIR からの相対パス */
    filePath: text('file_path').notNull(),
    thumbPath: text('thumb_path'),
    mime: text('mime').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('images_episode_idx').on(t.episodeId)],
);

export const providerSettings = sqliteTable('provider_settings', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  providerType: text('provider_type', { enum: ['openrouter', 'openai-compatible'] }).notNull(),
  baseUrl: text('base_url').notNull(),
  encryptedApiKey: text('encrypted_api_key'),
  defaultTextModel: text('default_text_model').notNull().default(''),
  defaultSummaryModel: text('default_summary_model').notNull().default(''),
  defaultImageModel: text('default_image_model').notNull().default(''),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

/** アプリ全体の設定（key-value） */
export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
});

export type WorldRow = typeof worlds.$inferSelect;
export type CharacterRow = typeof characters.$inferSelect;
export type LoreRow = typeof lore.$inferSelect;
export type EpisodeRow = typeof episodes.$inferSelect;
export type GenerationRow = typeof generations.$inferSelect;
export type ImageRow = typeof images.$inferSelect;
export type ProviderRow = typeof providerSettings.$inferSelect;
