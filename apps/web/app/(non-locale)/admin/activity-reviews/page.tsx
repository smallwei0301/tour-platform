'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageHeader, Card, Badge } from '../../../../src/components/admin/ui';
import { csrfHeaders } from '../../../../src/lib/csrf-client';

type PendingItem = {
  id: string;
  title: string;
  status: string;
  guideName: string;
  pendingSubmittedAt: string | null;
  hasConflict: boolean;
};

type PendingPlanItem = {
  id: string;
  name: string;
  activityTitle: string;
  guideName: string;
  status: string;
  isNewPlan: boolean;
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
type PlanReviewDetail = {
  plan: { name: string; activity?: { title?: string } | null };
  reviewState: string | null;
  hasConflict: boolean;
  isNewPlan: boolean;
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

const PLAN_FIELD_LABEL: Record<string, string> = {
  name: '方案名稱', description: '方案描述', duration_minutes: '時長（分鐘）',
  price_type: '計價方式', base_price: '價格', min_participants: '最少人數',
  max_participants: '最多人數', booking_type: '預約方式', is_year_round: '全年供應',
  highlights: '方案亮點', plan_inclusions: '包含項目', plan_exclusions: '不包含項目',
  plan_notices: '注意事項', plan_refund_rules: '退款規則', plan_itinerary: '站點時間表',
  language: '語言', details_link_text: '詳情連結文字', booking_btn_text: '預約按鈕文字',
};

function fmt(v: unknown): string {
  if (v == null || v === '') return '（空）';
  if (Array.isArray(v)) return v.length === 0 ? '（空）' : JSON.stringify(v, null, 0);
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function DiffList({ diff, labels }: { diff: DiffRow[]; labels: Record<string, string> }) {
  if (diff.length === 0) {
    return <p style={{ color: '#64748b' }}>沒有偵測到欄位變更。</p>;
  }
  return (
    <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
      {diff.map((d) => (
        <div key={d.field} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>{labels[d.field] || d.field}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13 }}>
            <div style={{ background: '#fef2f2', padding: 8, borderRadius: 6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{fmt(d.before)}</div>
            <div style={{ background: '#f0fdf4', padding: 8, borderRadius: 6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{fmt(d.after)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AdminActivityReviewsPage() {
  const [tab, setTab] = useState<'activities' | 'plans'>('activities');

  // ── 行程審核 ──
  const [items, setItems] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [adminNote, setAdminNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // ── 方案審核 ──
  const [planItems, setPlanItems] = useState<PendingPlanItem[]>([]);
  const [planLoading, setPlanLoading] = useState(true);
  const [planSelected, setPlanSelected] = useState<string | null>(null);
  const [planDetail, setPlanDetail] = useState<PlanReviewDetail | null>(null);
  const [planDetailLoading, setPlanDetailLoading] = useState(false);
  const [planAdminNote, setPlanAdminNote] = useState('');
  const [planBusy, setPlanBusy] = useState(false);

  const loadList = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/activity-reviews', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (j.ok) setItems(j.data || []); else setError(j.error?.message || '載入失敗'); })
      .catch(() => setError('載入失敗'))
      .finally(() => setLoading(false));
  }, []);

  const loadPlanList = useCallback(() => {
    setPlanLoading(true);
    fetch('/api/admin/plan-reviews', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (j.ok) setPlanItems(j.data || []); else setError(j.error?.message || '載入失敗'); })
      .catch(() => setError('載入失敗'))
      .finally(() => setPlanLoading(false));
  }, []);

  useEffect(() => { loadList(); loadPlanList(); }, [loadList, loadPlanList]);

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

  function openPlanDetail(id: string) {
    setPlanSelected(id);
    setPlanDetail(null);
    setPlanAdminNote('');
    setNotice('');
    setError('');
    setPlanDetailLoading(true);
    fetch(`/api/admin/plan-reviews/${id}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (j.ok) setPlanDetail(j.data); else setError(j.error?.message || '載入失敗'); })
      .catch(() => setError('載入失敗'))
      .finally(() => setPlanDetailLoading(false));
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

  async function resolvePlan(action: 'approve' | 'reject') {
    if (!planSelected) return;
    if (action === 'reject' && !planAdminNote.trim()) {
      setError('退回時請填寫退回原因，讓導遊知道要修改什麼。');
      return;
    }
    setPlanBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`/api/admin/plan-reviews/${planSelected}`, {
        method: 'POST',
        headers: csrfHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ action, adminNote: planAdminNote.trim() || null }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message || '處理失敗');
      setNotice(action === 'approve' ? '已核准，方案內容已套用並上架。' : '已退回，導遊會看到退回原因。');
      setPlanSelected(null);
      setPlanDetail(null);
      loadPlanList();
    } catch (e) {
      setError(e instanceof Error ? e.message : '處理失敗');
    } finally {
      setPlanBusy(false);
    }
  }

  const tabBtn = (key: 'activities' | 'plans'): React.CSSProperties => ({
    padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 14,
    fontWeight: tab === key ? 700 : 500,
    background: tab === key ? '#0f766e' : '#f1f5f9',
    color: tab === key ? '#fff' : '#475569',
  });

  return (
    <div>
      <PageHeader title="待審行程" subtitle="導遊送審的行程與方案修訂；核准後套用到上架內容，退回則附原因讓導遊修改。" />

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => setTab('activities')} style={tabBtn('activities')}>
          行程審核{items.length ? `（${items.length}）` : ''}
        </button>
        <button onClick={() => setTab('plans')} style={tabBtn('plans')}>
          方案審核{planItems.length ? `（${planItems.length}）` : ''}
        </button>
      </div>

      {error && <Card style={{ background: '#fee2e2', color: '#991b1b', marginBottom: 16 }}>{error}</Card>}
      {notice && <Card style={{ background: '#dcfce7', color: '#166534', marginBottom: 16 }}>{notice}</Card>}

      {tab === 'activities' ? (
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
                <DiffList diff={detail.diff} labels={FIELD_LABEL} />
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
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 360px) 1fr', gap: 16, alignItems: 'start' }}>
          {/* 待審方案清單 */}
          <div style={{ display: 'grid', gap: 10 }}>
            {planLoading ? (
              <p style={{ color: '#64748b' }}>載入中…</p>
            ) : planItems.length === 0 ? (
              <Card>目前沒有待審方案。</Card>
            ) : (
              planItems.map((it) => (
                <button
                  key={it.id}
                  onClick={() => openPlanDetail(it.id)}
                  style={{
                    textAlign: 'left', background: planSelected === it.id ? '#ecfdf5' : '#fff',
                    border: planSelected === it.id ? '2px solid #0f766e' : '1px solid #e2e8f0',
                    borderRadius: 10, padding: 14, cursor: 'pointer',
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>{it.name || '（未命名方案）'}</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>{it.activityTitle}</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Badge variant="default">{it.guideName || '未指派導遊'}</Badge>
                    {it.isNewPlan ? <Badge variant="info">新方案</Badge> : <Badge variant="success">已上架（編輯中）</Badge>}
                    {it.hasConflict && <Badge variant="warning">送審後 live 已被改</Badge>}
                  </div>
                </button>
              ))
            )}
          </div>

          {/* 方案審核明細（diff） */}
          <div>
            {!planSelected ? (
              <Card>← 從左側選一筆查看方案修改內容並審核。</Card>
            ) : planDetailLoading ? (
              <Card>載入明細中…</Card>
            ) : planDetail ? (
              <Card>
                <h3 style={{ marginTop: 0 }}>
                  {planDetail.plan.name}
                  {planDetail.plan.activity?.title ? <span style={{ fontSize: 13, color: '#64748b', fontWeight: 400 }}>（{planDetail.plan.activity.title}）</span> : null}
                </h3>
                {planDetail.isNewPlan && (
                  <div style={{ background: '#eff6ff', color: '#1e40af', padding: 12, borderRadius: 8, marginBottom: 12 }}>
                    🆕 這是導遊新建的方案，核准後會以 active 狀態上架售票。請確認下方內容後再核准。
                  </div>
                )}
                {planDetail.hasConflict && (
                  <div style={{ background: '#fef9c3', color: '#854d0e', padding: 12, borderRadius: 8, marginBottom: 12 }}>
                    ⚠️ 此方案在導遊送審後又被直接更動過，核准會以導遊送審的內容覆蓋這些欄位。
                  </div>
                )}
                <p style={{ color: '#64748b', fontSize: 13 }}>
                  {planDetail.isNewPlan
                    ? '新方案完整內容如下。'
                    : '以下為導遊提出的修改（左：目前上架內容，右：送審內容）。'}
                </p>
                {planDetail.isNewPlan && planDetail.diff.length === 0
                  ? <p style={{ color: '#64748b' }}>（內容請於核准後於方案管理查看完整欄位。）</p>
                  : <DiffList diff={planDetail.diff} labels={PLAN_FIELD_LABEL} />}
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>管理者備註（退回時必填）</label>
                <textarea
                  value={planAdminNote}
                  onChange={(e) => setPlanAdminNote(e.target.value)}
                  style={{ width: '100%', minHeight: 70, padding: 10, border: '1px solid #cbd5e1', borderRadius: 8, boxSizing: 'border-box', marginBottom: 12 }}
                  placeholder="例：價格偏高，請附上方案內容差異說明"
                />
                <div style={{ display: 'flex', gap: 12 }}>
                  <button onClick={() => resolvePlan('reject')} disabled={planBusy} style={{ flex: 1, background: '#fff', border: '1px solid #991b1b', color: '#991b1b', borderRadius: 8, padding: 12, fontWeight: 600, cursor: 'pointer' }}>
                    退回
                  </button>
                  <button onClick={() => resolvePlan('approve')} disabled={planBusy} style={{ flex: 1, background: '#0f766e', color: '#fff', border: 'none', borderRadius: 8, padding: 12, fontWeight: 600, cursor: 'pointer' }}>
                    {planBusy ? '處理中…' : '核准'}
                  </button>
                </div>
              </Card>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
