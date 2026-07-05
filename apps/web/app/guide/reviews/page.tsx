'use client';

/**
 * Issue #1592 — 導遊後台：評論回覆。
 * 列出自己活動的已核准評論，導遊可撰寫/覆寫/撤下公開回覆。
 * GET /api/v2/guide/reviews（session）；PUT /api/v2/guide/reviews/[id]/reply（session＋CSRF）。
 */

import { useCallback, useEffect, useState } from 'react';
import { csrfHeaders } from '../../../src/lib/csrf-client';

const REPLY_MAX = 1000;
const ACCENT = '#7c3aed';

type GuideReview = {
  id: string;
  activitySlug: string;
  author: string;
  rating: number | null;
  text: string;
  date: string | null;
  guideReply: { text: string; at: string | null } | null;
};

function Stars({ value }: { value: number | null }) {
  const filled = Math.max(0, Math.min(5, Math.round(Number(value) || 0)));
  return (
    <span aria-label={`${filled} 顆星`} style={{ color: '#f5a623', letterSpacing: 1 }}>
      {'★'.repeat(filled)}
      <span style={{ color: '#e5e7eb' }}>{'★'.repeat(5 - filled)}</span>
    </span>
  );
}

export default function GuideReviewsPage() {
  const [items, setItems] = useState<GuideReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [flash, setFlash] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v2/guide/reviews', { cache: 'no-store' });
      if (res.status === 401) {
        setError('請重新登入導遊後台');
        setItems([]);
        return;
      }
      const j = await res.json();
      const list: GuideReview[] = j?.data?.items ?? [];
      setItems(list);
      setDrafts(Object.fromEntries(list.map((r) => [r.id, r.guideReply?.text ?? ''])));
    } catch {
      setError('載入評論失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitReply(id: string) {
    setSavingId(id);
    setFlash((f) => ({ ...f, [id]: '' }));
    try {
      const res = await fetch(`/api/v2/guide/reviews/${id}/reply`, {
        method: 'PUT',
        headers: csrfHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ replyText: drafts[id] ?? '' }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.ok === false) {
        setFlash((f) => ({ ...f, [id]: j?.error?.message || '儲存失敗' }));
        return;
      }
      const replied: boolean = j?.data?.replied ?? Boolean((drafts[id] ?? '').trim());
      const replyAt: string | null = j?.data?.replyAt ?? null;
      setItems((prev) =>
        prev.map((r) =>
          r.id === id ? { ...r, guideReply: replied ? { text: (drafts[id] ?? '').trim(), at: replyAt } : null } : r,
        ),
      );
      setFlash((f) => ({ ...f, [id]: replied ? '已發布回覆' : '已撤下回覆' }));
    } catch {
      setFlash((f) => ({ ...f, [id]: '網路錯誤，請重試' }));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px' }}>評論回覆</h1>
      <p style={{ color: '#6b7280', fontSize: 14, margin: '0 0 20px' }}>
        回覆旅客的公開評價；回覆會顯示在活動頁該則評論下方（最多 {REPLY_MAX} 字，留空可撤下）。
      </p>

      {loading && <div style={{ color: '#6b7280', padding: '24px 0' }}>載入中…</div>}
      {error && !loading && (
        <div style={{ color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 14px' }}>
          {error}
        </div>
      )}
      {!loading && !error && items.length === 0 && (
        <div style={{ color: '#6b7280', background: '#fff', border: '1px solid #f3f4f6', borderRadius: 14, padding: '28px 20px', textAlign: 'center' }}>
          目前沒有可回覆的評論。
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {items.map((r) => {
          const draft = drafts[r.id] ?? '';
          const tooLong = draft.length > REPLY_MAX;
          const dirty = draft.trim() !== (r.guideReply?.text ?? '').trim();
          return (
            <div key={r.id} style={{ background: '#fff', borderRadius: 14, padding: '16px 18px', border: '1px solid #f3f4f6' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <strong style={{ fontSize: 14 }}>{r.author || '旅客'}</strong>
                  <Stars value={r.rating} />
                </div>
                <span style={{ color: '#9ca3af', fontSize: 12 }}>
                  {r.date || ''} · {r.activitySlug}
                </span>
              </div>
              <p style={{ margin: '10px 0 12px', fontSize: 14, lineHeight: 1.7, color: '#374151' }}>{r.text}</p>

              <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
                導遊回覆
              </label>
              <textarea
                value={draft}
                maxLength={REPLY_MAX + 50}
                onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                placeholder="謝謝您的參與，期待再相見…"
                rows={3}
                style={{
                  width: '100%', boxSizing: 'border-box', borderRadius: 10,
                  border: `1px solid ${tooLong ? '#dc2626' : '#e5e7eb'}`, padding: '10px 12px',
                  fontSize: 14, lineHeight: 1.6, resize: 'vertical', fontFamily: 'inherit',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, gap: 10 }}>
                <span style={{ fontSize: 12, color: tooLong ? '#dc2626' : '#9ca3af' }}>
                  {draft.length}/{REPLY_MAX}
                  {flash[r.id] && <span style={{ marginLeft: 10, color: '#059669' }}>{flash[r.id]}</span>}
                </span>
                <button
                  type="button"
                  onClick={() => submitReply(r.id)}
                  disabled={savingId === r.id || tooLong || !dirty}
                  style={{
                    background: savingId === r.id || tooLong || !dirty ? '#c4b5fd' : ACCENT,
                    color: '#fff', border: 'none', borderRadius: 10, padding: '8px 18px',
                    fontSize: 14, fontWeight: 600, cursor: savingId === r.id || tooLong || !dirty ? 'default' : 'pointer',
                  }}
                >
                  {savingId === r.id ? '儲存中…' : r.guideReply && !draft.trim() ? '撤下回覆' : '發布回覆'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
