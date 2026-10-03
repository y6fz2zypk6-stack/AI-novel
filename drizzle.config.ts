import { defineConfig } from 'drizzle-kit';

// スキーマを変えたら `npm run db:generate` で drizzle/ にマイグレーションSQLを追加する。
// アプリは起動時（最初のDBアクセス時）に未適用のマイグレーションを自動で適用する。
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
});
