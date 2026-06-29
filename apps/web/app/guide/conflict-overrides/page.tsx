'use client';

// #1497 — 導遊「例外加開幫手確認」頁。
// 管理者例外加開且需要幫手的時段會列在這裡，導遊可確認（找到幫手）或婉拒。
import { useCallback, useEffect, useState } from 'react';
import { csrfHeaders, ensureCsrfToken } from '../../../src/lib/csrf-client';

type OverrideItem = {
  id: string;
  activityId: string;
  activityPlanId: string;
  activityTitle: string;
  startAt: string;
  endAt: string;
  reason: string;
  requiresHelper: boolean;
  helperStatus: string;
  guideNote: string | null;
  createdAt: string;
};

function formatRange(startAt: string, endAt: string): string {
  try {
    const fmt = (iso: string) =>
      new Intl.DateTimeFormat('zh-TW', {
        timeZone: 'Asia/Taipei',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(new Date(iso));
    return `${fmt(startAt)} – ${fmt(endAt)}`;
  } catch {
    return `${startAt} – ${endAt}`;
  }
}

export default function GuideConflictOverridesPage() {
  const [items, setItems] = useState<OverrideItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const res = await fetch('/api/guide/conflict-overrides', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        setErr(json?.error?.message || '載入失敗');
        setItems([]);
      } else {
        setItems(json.data?.overrides ?? []);
      }
    } catch {
      setErr('載入失敗');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void ensureCsrfToken();
    void load();
  }, [load]);

  async function decide(id: string, action: 'confirm' | 'decline') {
    setBusyId(id);
    setErr('');
    try {
      const res = await fetch(`/api/guide/conflict-overrides/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        setErr(json?.error?.message || '操作失敗');
      } else {
        // 表態後該筆離開待辦清單。
        setItems((prev) => prev.filter((it) => it.id !== id));
      }
    } catch {
      setErr('操作失敗');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>幫手確認</h1>
      <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 20 }}>
        管理者為您例外加開了下列時間衝突的場次，且需要幫手協助。請確認您是否已安排好幫手。
      </p>

      {err && (
        <div role="alert" style={{
          background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626',
          padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 14,
        }}>
          {err}
        </div>
      )}

      {loading ? (
        <p style={{ color: '#9ca3af' }}>載入中…</p>
      ) : items.length === 0 ? (
        <div data-testid="conflict-override-empty" style={{
          background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12,
          padding: '32px 20px', textAlign: 'center', color: '#9ca3af',
        }}>
          目前沒有待確認的幫手安排。
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map((it) => (
            <div key={it.id} data-testid="conflict-override-card" style={{
              background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{it.activityTitle}</div>
                  <div style={{ color: '#374151', fontSize: 14 }}>{formatRange(it.startAt, it.endAt)}</div>
                </div>
                <span style={{
                  alignSelf: 'flex-start', padding: '2px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                  background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a',
                }}>
                  需要幫手
                </span>
              </div>

              <div style={{ marginTop: 10, fontSize: 13, color: '#6b7280' }}>
                <span style={{ fontWeight: 600, color: '#374151' }}>加開原因：</span>{it.reason}
              </div>
              {it.guideNote && (
                <div style={{ marginTop: 4, fontSize: 13, color: '#6b7280' }}>
                  <span style={{ fontWeight: 600, color: '#374151' }}>給導遊備註：</span>{it.guideNote}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button
                  onClick={() => decide(it.id, 'confirm')}
                  disabled={busyId === it.id}
                  style={{
                    padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: '#7c3aed', color: '#fff', fontSize: 14, fontWeight: 600,
                    opacity: busyId === it.id ? 0.6 : 1,
                  }}
                >
                  {busyId === it.id ? '處理中…' : '已安排幫手，確認'}
                </button>
                <button
                  onClick={() => decide(it.id, 'decline')}
                  disabled={busyId === it.id}
                  style={{
                    padding: '8px 16px', borderRadius: 8, border: '1px solid #e5e7eb', cursor: 'pointer',
                    background: '#fff', color: '#dc2626', fontSize: 14, fontWeight: 600,
                    opacity: busyId === it.id ? 0.6 : 1,
                  }}
                >
                  無法安排，婉拒
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
