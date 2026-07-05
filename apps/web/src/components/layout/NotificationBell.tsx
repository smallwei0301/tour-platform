'use client';

/**
 * Issue #1593 — 導覽列站內通知鈴鐺。
 * 登入後顯示；讀 GET /api/me/notifications 取未讀數，>0 顯示紅點徽章。
 * 點擊前往 /me/notifications 檢視完整清單（清單頁負責標已讀）。
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';

export function NotificationBell() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/me/notifications?limit=1', { cache: 'no-store' });
        if (!res.ok) return;
        const j = await res.json();
        if (alive) setUnread(Number(j?.data?.unreadCount) || 0);
      } catch {
        /* best-effort */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Link
      href="/me/notifications"
      aria-label={unread > 0 ? `站內通知，${unread} 則未讀` : '站內通知'}
      data-testid="nav-notifications"
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', color: 'rgba(244,236,216,0.82)' }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden focusable="false">
        <path
          d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {unread > 0 && (
        <span
          data-testid="nav-notifications-badge"
          style={{
            position: 'absolute',
            top: -4,
            right: -6,
            minWidth: 16,
            height: 16,
            padding: '0 4px',
            borderRadius: 999,
            background: '#c2542e',
            color: '#fff',
            fontSize: 10,
            fontWeight: 700,
            lineHeight: '16px',
            textAlign: 'center',
          }}
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );
}
