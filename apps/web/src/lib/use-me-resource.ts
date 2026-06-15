'use client';

import { useEffect, useState } from 'react';

/**
 * 旅客會員中心（/me/**）共用的極輕量 stale-while-revalidate 取數 hook。
 *
 * 動機：四個分頁是各自獨立的路由，切換時都會重新打 `/api/me/*`（伺服器端還要做一次
 * auth.getUser() + DB 查詢），且原本完全沒有 client 快取 —— 每次切分頁都從零重抓、
 * 看到「載入中」1–2 秒。
 *
 * 行為：
 *  - 有快取 → 立即回傳舊資料（loading=false），背景靜默 revalidate，切回分頁瞬開。
 *  - 無快取 → loading=true，抓完才顯示。
 *  - 401 → 呼叫 onUnauthorized（導去登入）。
 *
 * 快取是 module-level（同一個 SPA session 共用）；整頁重載（goto/F5）會重置，因此
 * 不影響以 page.goto 為主的 E2E，也不會跨使用者外洩（重載即清空）。
 */
const cache = new Map<string, unknown>();

export function readMeCache<T>(endpoint: string): T | undefined {
  return cache.get(endpoint) as T | undefined;
}

export function writeMeCache<T>(endpoint: string, data: T): void {
  cache.set(endpoint, data);
}

export function clearMeCache(endpoint?: string): void {
  if (endpoint) cache.delete(endpoint);
  else cache.clear();
}

interface Options {
  onUnauthorized?: () => void;
}

interface Result<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  setData: (d: T) => void;
}

export function useMeResource<T>(endpoint: string, opts: Options = {}): Result<T> {
  const { onUnauthorized } = opts;
  const cached = cache.has(endpoint) ? (cache.get(endpoint) as T) : null;
  const [data, setDataState] = useState<T | null>(cached);
  const [loading, setLoading] = useState<boolean>(!cache.has(endpoint));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // 有快取就先顯示舊資料、背景更新（不轉圈）；無快取才顯示 loading。
    if (!cache.has(endpoint)) setLoading(true);

    (async () => {
      try {
        const res = await fetch(endpoint, { cache: 'no-store' });
        if (res.status === 401) {
          if (!cancelled) onUnauthorized?.();
          return;
        }
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        const next = (json?.data ?? null) as T;
        cache.set(endpoint, next);
        setDataState(next);
        setError(null);
      } catch {
        // 已有快取時不覆蓋成錯誤畫面（維持舊資料）；無快取才報錯。
        if (!cancelled && !cache.has(endpoint)) setError('載入失敗，請稍後再試');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [endpoint]); // eslint-disable-line react-hooks/exhaustive-deps

  const setData = (d: T) => {
    cache.set(endpoint, d);
    setDataState(d);
  };

  return { data, loading, error, setData };
}
