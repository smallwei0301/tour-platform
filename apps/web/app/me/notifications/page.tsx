'use client';

/**
 * Issue #1593 — 會員站內通知中心。
 * 列出登入旅客的通知（新到舊），可一鍵標記全部已讀。
 * GET /api/me/notifications（session）；POST /api/me/notifications/read（session＋CSRF）。
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MemberTabs } from '../../../src/components/me/MemberTabs';
import { useMeResource } from '../../../src/lib/use-me-resource';
import { csrfHeaders, ensureCsrfToken } from '../../../src/lib/csrf-client';

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link_path: string | null;
  read_at: string | null;
  created_at: string;
};

const TYPE_ICON: Record<string, string> = {
  message_reply: '💬',
  reschedule_result: '📅',
  order_status: '🧾',
  review_invited: '⭐',
};

const pageStyle: React.CSSProperties = { paddingTop: 32, paddingBottom: 56, minHeight: '70vh' };
const titleStyle: React.CSSProperties = {
  fontFamily: 'var(--tp-serif)', fontSize: 'clamp(22px, 5vw, 28px)', fontWeight: 700,
  color: 'var(--tp-text)', margin: '0 0 4px', letterSpacing: '0.02em',
};

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-TW', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export default function MyNotificationsPage() {
  const router = useRouter();
  const { data, loading, error: err, setData } = useMeResource<{ items: NotificationItem[]; unreadCount: number }>(
    '/api/me/notifications',
    { onUnauthorized: () => router.replace(`/login?next=${encodeURIComponent('/me/notifications')}`) },
  );
  const items = data?.items ?? [];
  const unreadCount = data?.unreadCount ?? 0;
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    void ensureCsrfToken();
  }, []);

  async function markAllRead() {
    if (marking || unreadCount === 0) return;
    setMarking(true);
    try {
      await ensureCsrfToken();
      const res = await fetch('/api/me/notifications/read', {
        method: 'POST',
        headers: csrfHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({}),
      });
      if (res.ok && data) {
        const nowIso = new Date().toISOString();
        setData({
          items: data.items.map((n) => (n.read_at ? n : { ...n, read_at: nowIso })),
          unreadCount: 0,
        });
      }
    } catch {
      /* best-effort */
    } finally {
      setMarking(false);
    }
  }

  return (
    <main className="tp-container" style={pageStyle}>
      <h1 style={titleStyle} data-testid="my-notifications-title">站內通知</h1>
      <p style={{ fontSize: 13, color: 'var(--tp-muted)', margin: '0 0 20px' }}>
        訂單狀態、嚮導回覆、改期結果都會通知您。
      </p>
      <MemberTabs />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 10 }}>
        <span style={{ fontSize: 13, color: 'var(--tp-muted)' }} data-testid="notifications-unread-count">
          {unreadCount > 0 ? `${unreadCount} 則未讀` : '沒有未讀通知'}
        </span>
        <button
          type="button"
          onClick={markAllRead}
          disabled={marking || unreadCount === 0}
          data-testid="notifications-mark-all"
          className="tp-btn"
          style={{
            fontSize: 13, padding: '6px 14px', borderRadius: 999,
            border: '1px solid var(--tp-border)', background: 'transparent',
            color: unreadCount === 0 ? 'var(--tp-muted)' : 'var(--tp-text)',
            cursor: marking || unreadCount === 0 ? 'default' : 'pointer',
          }}
        >
          {marking ? '處理中…' : '全部標為已讀'}
        </button>
      </div>

      {err && <p style={{ color: 'var(--tp-accent)', fontSize: 13, marginBottom: 16 }}>{err}</p>}
      {loading && <p style={{ color: 'var(--tp-muted)', textAlign: 'center', padding: '40px 0' }}>載入通知中…</p>}

      {!loading && items.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--tp-muted)' }} data-testid="notifications-empty">
          <div style={{ fontSize: 40, marginBottom: 10, opacity: 0.85 }}>🔔</div>
          <p style={{ fontSize: 14, margin: 0 }}>目前沒有通知</p>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div style={{ display: 'grid', gap: 10 }}>
          {items.map((n) => {
            const unread = !n.read_at;
            const inner = (
              <div
                data-testid="notification-item"
                data-unread={unread ? '1' : '0'}
                className="tp-card"
                style={{
                  padding: 16, display: 'flex', gap: 12, alignItems: 'flex-start',
                  borderLeft: unread ? '3px solid var(--tp-accent)' : '3px solid transparent',
                }}
              >
                <span style={{ fontSize: 20, lineHeight: 1.2, flexShrink: 0 }} aria-hidden>
                  {TYPE_ICON[n.type] || '🔔'}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                    <strong style={{ fontSize: 14, color: 'var(--tp-text)' }}>{n.title}</strong>
                    <span style={{ fontSize: 11, color: 'var(--tp-muted)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                      {fmtTime(n.created_at)}
                    </span>
                  </div>
                  {n.body && (
                    <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--tp-muted)', lineHeight: 1.6, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                      {n.body}
                    </p>
                  )}
                </div>
              </div>
            );
            return n.link_path ? (
              <Link key={n.id} href={n.link_path} style={{ textDecoration: 'none' }}>
                {inner}
              </Link>
            ) : (
              <div key={n.id}>{inner}</div>
            );
          })}
        </div>
      )}
    </main>
  );
}
