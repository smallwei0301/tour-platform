'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfHeaders, ensureCsrfToken } from '../lib/csrf-client';
import { useTravelerAuth, invalidateTravelerAuth } from '../lib/use-traveler-auth';

interface WishlistToggleProps {
  activityId: string;
  initialWishlisted?: boolean;
  isLoggedIn?: boolean;
  /**
   * `overlay`（預設）— 絕對定位浮在卡片封面右上角，給行程卡使用。
   * `inline` — 隨父層 flex 排版，給詳情頁底部操作列使用。
   */
  variant?: 'overlay' | 'inline';
}

/** 取得目前頁面路徑（含 query），登入後可導回原頁。 */
function currentPath(): string {
  if (typeof window === 'undefined') return '/';
  return window.location.pathname + window.location.search;
}

/**
 * Heart icon toggle for adding/removing an activity from the user's wishlist.
 *
 * 登入判斷以 `supabase.auth.getUser()` 為唯一真實來源（透過 useTravelerAuth），
 * 不再依賴父層傳入或 cookie sniff —— 因此在列表卡、首頁卡、詳情頁底部列都一致可用。
 * `isLoggedIn` 僅作為初始提示以避免閃爍；最終以 getUser + API 401 為準。
 *
 * 註：本專案沒有設定 Tailwind（全站走 inline style / globals.css），
 * 因此這顆按鈕一律用 inline style，避免 utility class 失效導致愛心
 * 渲染成空白方塊（#收藏愛心未顯示）。
 */
export function WishlistToggle({
  activityId,
  initialWishlisted = false,
  isLoggedIn = false,
  variant = 'overlay',
}: WishlistToggleProps) {
  const router = useRouter();
  // isLoggedIn=true 才當作已確定登入的提示；否則 null（未知）→ 點擊前 await getUser。
  const { authed, ensureAuthed } = useTravelerAuth(isLoggedIn ? true : null);
  const [wishlisted, setWishlisted] = useState(initialWishlisted);
  const [loading, setLoading] = useState(false);

  function redirectToLogin() {
    router.push(`/login?next=${encodeURIComponent(currentPath())}`);
  }

  async function handleToggle(e: React.MouseEvent) {
    // 卡片整片覆蓋著 .tp-card-link-overlay，點愛心不應觸發整卡導頁。
    e.preventDefault();
    e.stopPropagation();
    if (loading) return;

    // 登入判斷以 getUser 為準（authed 尚未解析時 await ensureAuthed）。
    const loggedIn = authed ?? (await ensureAuthed());
    if (!loggedIn) {
      redirectToLogin();
      return;
    }

    setLoading(true);
    const prev = wishlisted;
    // Optimistic update
    setWishlisted(!wishlisted);

    try {
      await ensureCsrfToken();

      const res = !prev
        ? await fetch('/api/me/wishlist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
            body: JSON.stringify({ activityId }),
          })
        : await fetch(`/api/me/wishlist/${activityId}`, {
            method: 'DELETE',
            headers: { ...csrfHeaders() },
          });

      if (!res.ok) {
        setWishlisted(prev); // rollback on failure
        // session 過期 / 提示有誤 → 以 API 為準，導去登入。
        if (res.status === 401) {
          invalidateTravelerAuth(false);
          redirectToLogin();
        }
      }
    } catch {
      setWishlisted(prev); // rollback on network error
    } finally {
      setLoading(false);
    }
  }

  const overlayPosition: React.CSSProperties =
    variant === 'overlay'
      ? { position: 'absolute', top: 10, right: 10, zIndex: 3 }
      : {};

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={loading}
      aria-label={wishlisted ? '取消收藏' : '加入收藏'}
      aria-pressed={wishlisted}
      data-testid="wishlist-toggle"
      style={{
        ...overlayPosition,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 40,
        height: 40,
        borderRadius: '50%',
        border: '1px solid',
        cursor: loading ? 'default' : 'pointer',
        opacity: loading ? 0.6 : 1,
        transition: 'background 0.15s, border-color 0.15s, color 0.15s',
        background: wishlisted ? 'rgba(254, 226, 226, 0.95)' : 'rgba(255, 255, 255, 0.92)',
        borderColor: wishlisted ? '#fca5a5' : 'rgba(0, 0, 0, 0.12)',
        color: wishlisted ? '#ef4444' : '#6b7280',
        boxShadow: '0 1px 4px rgba(0, 0, 0, 0.18)',
        backdropFilter: 'blur(2px)',
        padding: 0,
        lineHeight: 0,
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width={20}
        height={20}
        fill={wishlisted ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
        />
      </svg>
    </button>
  );
}

export default WishlistToggle;
