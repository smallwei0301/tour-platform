'use client';

import { useRef } from 'react';

/**
 * 同一份可提交 draft 內容重送時重用 key；使用者修改內容後立即換 key，
 * 因此不會把合法的新意圖誤判為舊 key 的 payload conflict。
 */
export function useDraftIdempotencyKey(intent: string): () => string {
  const keyRef = useRef<{ intent: string; key: string } | null>(null);
  return () => {
    if (keyRef.current?.intent !== intent) {
      keyRef.current = { intent, key: crypto.randomUUID() };
    }
    return keyRef.current.key;
  };
}
