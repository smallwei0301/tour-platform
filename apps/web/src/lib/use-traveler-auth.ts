'use client';

import { useEffect, useState } from 'react';
import { createClient } from './supabase/client';

/**
 * 旅客登入狀態的單一真實來源（client 端）。
 *
 * 背景：先前列表頁用 `document.cookie` 正規化判斷登入，但 Supabase SSR 的
 * `sb-<ref>-auth-token` cookie 可能是 httpOnly、或被切成 `...auth-token.0/.1`
 * 分段，導致 cookie sniff 永遠判為「未登入」→ 收藏愛心一律跳登入頁。
 *
 * 這裡改用 `supabase.auth.getUser()` 作為唯一判準，並以 module-level 快取讓
 * 同一頁的多張卡（多個 WishlistToggle）共用一次 getUser 呼叫，避免 N 次往返。
 * 登入/登出時 onAuthStateChange 會即時刷新快取。
 */

type SupaClient = ReturnType<typeof createClient>;

let sharedClient: SupaClient | null = null;
function getSharedClient(): SupaClient | null {
  if (sharedClient) return sharedClient;
  try {
    sharedClient = createClient();
  } catch {
    // NEXT_PUBLIC_SUPABASE_* 缺漏時不讓元件整個爆掉，視為未登入。
    sharedClient = null;
  }
  return sharedClient;
}

let authedPromise: Promise<boolean> | null = null;

/** 解析（並快取）目前是否為已登入旅客。多個元件共用同一個 Promise。 */
export function resolveTravelerAuthed(): Promise<boolean> {
  if (authedPromise) return authedPromise;
  const client = getSharedClient();
  if (!client) return Promise.resolve(false);
  authedPromise = client.auth
    .getUser()
    .then(({ data }) => !!data?.user)
    .catch(() => false);
  return authedPromise;
}

/** 外部（如 API 回 401）得知 session 失效時，重置快取讓下次重新判斷。 */
export function invalidateTravelerAuth(value: boolean | null = null): void {
  authedPromise = value === null ? null : Promise.resolve(value);
}

/**
 * @param initial 初始提示（例如父層已用 SSR/getUser 確認登入時傳 true）；
 *                未知時傳 null，點擊前會 await getUser 再決定。
 */
export function useTravelerAuth(initial: boolean | null = null) {
  const [authed, setAuthed] = useState<boolean | null>(initial);

  useEffect(() => {
    let active = true;
    resolveTravelerAuthed().then((v) => {
      if (active) setAuthed(v);
    });

    const client = getSharedClient();
    const sub = client?.auth.onAuthStateChange((_event, session) => {
      const next = !!session?.user;
      authedPromise = Promise.resolve(next); // 刷新共用快取
      if (active) setAuthed(next);
    });

    return () => {
      active = false;
      sub?.data.subscription.unsubscribe();
    };
  }, []);

  return { authed, ensureAuthed: resolveTravelerAuthed };
}
