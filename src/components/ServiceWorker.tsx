'use client';

import { useEffect } from 'react';
import { BASE_PATH } from '@/lib/client';

/** Service Worker を登録する（本番ビルドのみ） */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register(`${BASE_PATH}/sw.js`, { scope: BASE_PATH || '/' }).catch(() => {
      // 登録できなくてもアプリは動く
    });
  }, []);
  return null;
}
