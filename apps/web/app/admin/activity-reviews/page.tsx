'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageHeader, Card, Badge } from '../../../src/components/admin/ui';
import { csrfHeaders } from '../../../src/lib/csrf-client';

type PendingItem = {
  id: string;
  title: string;
  status: string;
  guideName: string;
  pendingSubmittedAt: string | null;
  hasConflict: boolean;
};

type DiffRow = { field: string; before: unknown; after: unknown };
type ReviewDetail = {
  activity: { title: string; slug: string };
  reviewState: string | null;
  hasConflict: boolean;
  diff: DiffRow[];
};

const FIELD_LABEL: Record<string, string> = {
  title: '行程名稱', tagline: '標語', shortDescription: '短描述', description: '完整描述',
  region: '地區', regionSlug: '地區代碼', category: '類別', priceTwd: '每人價格',
  durationMinutes: '行程時長', meetingPoint: '集合地點', meetingPointMapUrl: '集合地圖',
  coverImageUrl: '封面圖', imageUrls: '相簿', inclusions: '包含項目', exclusions: '不包含項目',
  notices: '注意事項', refundRules: '退款規則', goodFor: '適合對象', safetyNotice: '安全說明',
  faq: '常見問題', itinerary: '行程時間表', socialProofQuotes: '口碑語錄',
};

function fmt(v: unknown): string {
  if (v == null || v === '') return '（空）';
  if (Array.isArray(v)) return v.length === 0 ? '（空）' : JSON.stringify(v, null, 0);
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export default function AdminActivityReviewsPage() {
  const [items, setItems] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [adminNote, setAdminNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadList = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/activity-reviews', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (j.ok) setItems(j.data || []); else setError(j.error?.message || '載入失敗'); })
      .catch(() => setError('載入失敗'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  function openDetail(id: string) {
    setSelected(id);
    setDetail(null);
    setAdminNote('');
    setNotice('');
    setError('');
    setDetailLoading(true);
    fetch(`/api/admin/activities/${id}/review`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (j.ok) setDetail(j.data); else setError(j.error?.message || '載入失敗'); })
      .catch(() => setError('載入失敗'))
      .finally(() => setDetailLoading(false));
  }

  async function resolve(action: 'approve' | 'reject') {
    if (!selected) return;
    if (action === 'reject' && !adminNote.trim()) {
      setError('退回時請填寫退回原因，讓導遊知道要修改什麼。');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`/api/admin/activities/${selected}/review`, {
        method: 'POST',
        headers: csrfHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ action, adminNote: adminNote.trim() || null }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message || '處理失敗');
      setNotice(action === 'approve' ? '已核准，內容已套用。若為草稿需上架，請到行程列表發佈。' : '已退回，導遊會看到退回原因。');
      setSelected(null);
      setDetail(null);
      loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : '處理失敗');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="待審行程" subtitle="導遊送審的行程修訂；核准後套用到上架內容，退回則附原因讓導遊修改。" />

      {error && <Card style={{ background: '#fee2e2', color: '#991b1b', marginBottom: 16 }}>{error}</Card>}
      {notice && <Card style={{ background: '#dcfce7', color: '#166534', marginBottom: 16 }}>{notice}</Card>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 360px) 1fr', gap: 16, alignItems: 'start' }}>
        {/* 待審清單 */}
        <div style={{ display: 'grid', gap: 10 }}>
          {loading ? (
            <p style={{ color: '#64748b' }}>載入中…</p>
          ) : items.length === 0 ? (
            <Card>目前沒有待審行程。</Card>
          ) : (
            items.map((it) => (
              <button
                key={it.id}
                onClick={() => openDetail(it.id)}
                style={{
                  textAlign: 'left', background: selected === it.id ? '#ecfdf5' : '#fff',
                  border: selected === it.id ? '2px solid #0f766e' : '1px solid #e2e8f0',
                  borderRadius: 10, padding: 14, cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 6 }}>{it.title || '（未命名）'}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Badge variant="default">{it.guideName || '未指派導遊'}</Badge>
                  {it.status === 'published' && <Badge variant="success">已上架（編輯中）</Badge>}
                  {it.hasConflict && <Badge variant="warning">送審後 live 已被改</Badge>}
                </div>
              </button>
            ))
          )}
        </div>

        {/* 審核明細（diff） */}
        <div>
          {!selected ? (
            <Card>← 從左側選一筆查看修改內容並審核。</Card>
          ) : detailLoading ? (
            <Card>載入明細中…</Card>
          ) : detail ? (
            <Card>
              <h3 style={{ marginTop: 0 }}>{detail.activity.title}</h3>
              {detail.hasConflict && (
                <div style={{ background: '#fef9c3', color: '#854d0e', padding: 12, borderRadius: 8, marginBottom: 12 }}>
                  ⚠️ 此行程在導遊送審後又被（管理者）直接更動過，核准會以導遊送審的內容覆蓋這些欄位，請確認下方 diff 後再核准。
                </div>
              )}
              <p style={{ color: '#64748b', fontSize: 13 }}>以下為導遊提出的修改（左：目前上架內容，右：送審內容）。</p>

              {detail.diff.length === 0 ? (
                <p style={{ color: '#64748b' }}>沒有偵測到欄位變更。</p>
              ) : (
                <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
                  {detail.diff.map((d) => (
                    <div key={d.field} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
                      <div style={{ fontWeight: 600, marginBottom: 8 }}>{FIELD_LABEL[d.field] || d.field}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13 }}>
                        <div style={{ background: '#fef2f2', padding: 8, borderRadius: 6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{fmt(d.before)}</div>
                        <div style={{ background: '#f0fdf4', padding: 8, borderRadius: 6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{fmt(d.after)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>管理者備註（退回時必填）</label>
              <textarea
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                style={{ width: '100%', minHeight: 70, padding: 10, border: '1px solid #cbd5e1', borderRadius: 8, boxSizing: 'border-box', marginBottom: 12 }}
                placeholder="例：價格與方案不符，請改回原價"
              />
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={() => resolve('reject')} disabled={busy} style={{ flex: 1, background: '#fff', border: '1px solid #991b1b', color: '#991b1b', borderRadius: 8, padding: 12, fontWeight: 600, cursor: 'pointer' }}>
                  退回
                </button>
                <button onClick={() => resolve('approve')} disabled={busy} style={{ flex: 1, background: '#0f766e', color: '#fff', border: 'none', borderRadius: 8, padding: 12, fontWeight: 600, cursor: 'pointer' }}>
                  {busy ? '處理中…' : '核准'}
                </button>
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
