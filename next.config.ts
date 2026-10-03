import type { NextConfig } from 'next';
import pkg from './package.json' with { type: 'json' };

// パスで併存させる場合（例: /novel）だけビルド時に指定する。既定はルート（別オリジン運用）
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\/+$/, '');

// Service Worker のキャッシュ名に使う。ビルドごとに変わる
const buildId = `${pkg.version}-${Date.now().toString(36)}`;

const nextConfig: NextConfig = {
  // Docker 用のビルドだけ standalone にする（`next start` と併用できないため）
  output: process.env.BUILD_STANDALONE === '1' ? 'standalone' : undefined,
  basePath: basePath || undefined,
  poweredByHeader: false,
  serverExternalPackages: ['better-sqlite3', 'sharp'],
  generateBuildId: async () => buildId,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_BUILD_ID: buildId,
    NEXT_PUBLIC_APP_VERSION: pkg.version,
  },
};

export default nextConfig;
