'use client';

import { useEffect, useState } from 'react';
import { csrfHeaders } from '../../../src/lib/csrf-client';
import { isGuideContactActivityId } from '../../../src/lib/guide-contact-qa.mjs';
import { ResponsiveTable, ResponsiveModal, type ResponsiveColumn } from '../../../src/components/admin/responsive';

type QAEntry = {
  id: string;
  activity_id: string;
  question: string;
  answer: string | null;
  status: string;
  created_at: string;
  user_id?: string;
};

type RevenueTrendItem = {
  month: string;
  gmvTwd: number;
  orderCount: number;
};

type DashboardData = {
  monthlyBookings: number;
  pendingBookings: Array<{
    id: string; guestName: string; partySize: number;
    status: string; createdAt: string; tourTitle: string; totalTwd: number;
  }>;
  upcomingSchedules: Array<{
    id: string; tourTitle: string; date: string;
    planId: string; bookedCount: number; maxCapacity: number; status: string;
  }>;
  monthGmvTwd: number;
  monthGmvOrderCount: number;
  revenueTrend6m: RevenueTrendItem[];
  expectedPayoutTwd: number | null;
  nextPayoutDate: string | null;
  currentBalanceTwd: number | null;
  lastSettledAt: string | null;
  minWithdrawalTwd: number | null;
  pendingPayoutTwd: number | null;
  settlementRulesVersion: string;
  pendingSettlementOrders: Array<{
    orderId: string;
    tourTitle: string;
    scheduleDate: string | null;
    totalTwd: number;
    status: string;
  }>;
};

type ScheduleBooking = {
  id: string;
  guestName: string;
  guestPhone: string;
  maskedEmail: string;
  partySize: number;
  status: string;
  totalTwd: number;
  paidAt: string | null;
};

type PayoutOrderItem = {
  orderId: string;
  activityId: string;
  activityTitle: string;
  totalTwd: number;
  refundAmountTwd: number;
  effectiveTwd: number;
  commissionTwd: number;
  netTwd: number;
};

type PayoutDetailResponse = {
  month: string;
  orders: PayoutOrderItem[];
  totals: { gmvTwd: number; commissionTwd: number; netTwd: number };
};

const STATUS_LABELS: Record<string, string> = {
  pending_payment: '待付款',
  confirmed: '已確認',
  cancelled: '已取消',
  refunded: '已退款',
  refund_pending: '待對帳',
  open: '開放',
  full: '額滿',
  cancelled_schedule: '已取消',
};

export default function GuideDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isNew, setIsNew] = useState(false);

  // Pending Q&A state
  const [pendingQa, setPendingQa] = useState<QAEntry[]>([]);
  const [qaLoading, setQaLoading] = useState(false);
  const [qaAnswerMap, setQaAnswerMap] = useState<Record<string, string>>({});
  const [qaActionLoading, setQaActionLoading] = useState<string | null>(null);

  // Payout detail modal
  const [payoutModal, setPayoutModal] = useState<string | null>(null); // month string e.g. "2026-05"
  const [payoutDetail, setPayoutDetail] = useState<PayoutDetailResponse | null>(null);
  const [payoutLoading, setPayoutLoading] = useState(false);

  // Schedule detail modal
  const [scheduleModal, setScheduleModal] = useState<{
    scheduleId: string; tourTitle: string; date: string; planId: string;
    bookedCount: number; maxCapacity: number;
  } | null>(null);
  const [scheduleBookings, setScheduleBookings] = useState<ScheduleBooking[]>([]);
  const [scheduleBookingsLoading, setScheduleBookingsLoading] = useState(false);

  const openPayoutDetail = async (month: string) => {
    setPayoutModal(month);
    setPayoutLoading(true);
    setPayoutDetail(null);
    try {
      const res = await fetch(`/api/guide/payout/monthly?month=${month}`);
      const json = await res.json();
      if (json.ok) setPayoutDetail(json.data);
    } finally {
      setPayoutLoading(false);
    }
  };

  async function openScheduleDetail(s: NonNullable<DashboardData['upcomingSchedules']>[0]) {
    setScheduleModal({ scheduleId: s.id, tourTitle: s.tourTitle, date: s.date, planId: s.planId, bookedCount: s.bookedCount, maxCapacity: s.maxCapacity });
    setScheduleBookings([]);
    setScheduleBookingsLoading(true);
    try {
      const res = await fetch(`/api/guide/bookings?scheduleId=${s.id}`);
      const json = await res.json();
      setScheduleBookings(json?.data || []);
    } finally {
      setScheduleBookingsLoading(false);
    }
  }

  useEffect(() => {
    // Check if new user (cookie)
    setIsNew(document.cookie.includes('guide_is_new=1'));

    fetch('/api/guide/dashboard')
      .then((r) => r.json())
      .then((json) => setData(json?.data))
      .finally(() => setLoading(false));
  }, []);

  async function loadQa() {
    setQaLoading(true);
    try {
      const res = await fetch('/api/guide/qa?status=pending_moderation', { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        setPendingQa(json?.data?.data || json?.data || []);
      }
    } catch {
      // silently ignore — Q&A section degrades gracefully
    } finally {
      setQaLoading(false);
    }
  }

  async function handleQaAnswer(id: string) {
    const answer = qaAnswerMap[id] ?? '';
    if (!answer.trim()) {
      alert('請先填寫回答內容再送出');
      return;
    }
    setQaActionLoading(id);
    try {
      const res = await fetch(`/api/guide/qa/${id}`, {
        method: 'PATCH',
        headers: csrfHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ answer: answer.trim(), status: 'approved' }),
      });
      if (res.ok) {
        setQaAnswerMap((prev) => { const next = { ...prev }; delete next[id]; return next; });
        setPendingQa((prev) => prev.filter((q) => q.id !== id));
      } else {
        const json = await res.json();
        alert('回答失敗：' + (json.error?.message || '未知錯誤'));
      }
    } catch {
      alert('網路錯誤，請重試');
    } finally {
      setQaActionLoading(null);
    }
  }

  useEffect(() => {
    void loadQa();
  }, []);

  const [guideName, setGuideName] = useState('導遊');

  useEffect(() => {
    const raw = document.cookie.split(';').map(c => c.trim())
      .find(c => c.startsWith('guide_name='))?.split('=')[1] || '導遊';
    setGuideName(decodeURIComponent(raw));
  }, []);

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>載入中…</div>;
  }

  // Current month in Asia/Taipei (UTC+8) for payout drawer
  const taipeiNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const currentMonthStr = `${taipeiNow.getUTCFullYear()}-${String(taipeiNow.getUTCMonth() + 1).padStart(2, '0')}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <h1 className="sr-only">導遊後台</h1>
      {/* Welcome Banner */}
      {isNew && (
        <div style={{
          background: 'linear-gradient(135deg, #f5f3ff, #ede9fe)',
          borderRadius: 14,
          padding: '16px 20px',
          border: '1px solid #ddd6fe',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#5b21b6' }}>
              👋 歡迎 {guideName}！
            </div>
            <div style={{ fontSize: 13, color: '#7c3aed', marginTop: 4 }}>
              這是你的導遊後台。你可以在這裡管理場次和查看訂單。
            </div>
          </div>
          <button
            onClick={() => { setIsNew(false); document.cookie = 'guide_is_new=; Path=/guide; Max-Age=0'; }}
            aria-label="關閉歡迎訊息"
            style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#a78bfa' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="admin-stat-grid-3">
        <StatCard label="本月預訂數" value={data?.monthlyBookings ?? 0} icon="📦" />
        <StatCard label="近期訂單" value={data?.pendingBookings?.length ?? 0} icon="📋" />
        <StatCard label="本週場次" value={data?.upcomingSchedules?.length ?? 0} icon="📅" />
      </div>

      {/* Revenue Stats */}
      <div className="admin-stat-grid-3">
        <RevenueCard
          label="本月營收"
          value={`NT$ ${(data?.monthGmvTwd ?? 0).toLocaleString()}`}
          subtext={`共 ${data?.monthGmvOrderCount ?? 0} 筆訂單`}
          icon="💰"
        />
        <RevenueCard
          label="本月預計入帳"
          value={data?.expectedPayoutTwd != null ? `NT$${data.expectedPayoutTwd.toLocaleString()}` : '--'}
          subtext="點擊查看明細 · 平台抽成 15%，導遊實拿 85%；以旅客實付金額扣除已退款部分後計算；最低出款門檻：NT$5,000；金流手續費平台吸收"
          icon="🏦"
          muted={data?.expectedPayoutTwd == null}
          onClick={() => openPayoutDetail(currentMonthStr)}
        />
        <RevenueCard
          label="下次出款日"
          value={data?.nextPayoutDate ?? '--'}
          subtext="活動完成後第 7 天（T+7）依結算規則 v1 出款"
          icon="📆"
          muted={data?.nextPayoutDate == null}
        />
      </div>

      {/* Settlement Balance Card */}
      {data?.currentBalanceTwd !== null && data?.currentBalanceTwd !== undefined && (
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: 16, marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: '#166534', marginBottom: 4 }}>可結算餘額</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#15803d' }}>
            NT${data.currentBalanceTwd.toLocaleString()}
          </div>
          {data.minWithdrawalTwd && (
            <div style={{ fontSize: 11, color: '#4ade80', marginTop: 4 }}>
              {`最低出款門檻：NT$${data.minWithdrawalTwd.toLocaleString()}`}
              {data.currentBalanceTwd >= data.minWithdrawalTwd
                ? ' ✓ 已達門檻'
                : ` · 尚差 NT$${(data.minWithdrawalTwd - data.currentBalanceTwd).toLocaleString()}`}
            </div>
          )}
          {data.pendingPayoutTwd && (
            <div style={{ fontSize: 11, color: '#ea580c', marginTop: 4 }}>
              待出款：NT${data.pendingPayoutTwd.toLocaleString()}
            </div>
          )}
        </div>
      )}

      {/* 待對帳區塊 — refund_pending orders */}
      {(data?.pendingSettlementOrders?.length ?? 0) > 0 && (
        <Section title="⏳ 待對帳">
          <div style={{ fontSize: 12, color: '#c2410c', marginBottom: 12, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '8px 12px' }}>
            退款處理中，金額可能變動
          </div>
          {/* ResponsiveTable's internal <Th> already renders scope="col"
              so the a11y improvement from PR #1055 is preserved. */}
          <ResponsiveTable
            columns={[
              {
                key: 'orderId', header: '訂單編號',
                cell: (o: DashboardData['pendingSettlementOrders'][number]) => (
                  <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#9ca3af' }}>
                    {o.orderId.slice(0, 8)}…
                  </span>
                ),
              },
              { key: 'tour', header: '行程名稱', mobilePriority: 'title',
                cell: (o) => o.tourTitle },
              { key: 'date', header: '出團日',
                cell: (o) => (
                  <span style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>
                    {o.scheduleDate ? new Date(o.scheduleDate).toLocaleDateString('zh-TW') : '—'}
                  </span>
                ),
              },
              { key: 'amount', header: '訂單金額', align: 'right',
                cell: (o) => (
                  <span style={{ fontSize: 13, color: '#374151', whiteSpace: 'nowrap' }}>
                    NT$ {(o.totalTwd ?? 0).toLocaleString()}
                  </span>
                ),
              },
              { key: 'status', header: '當前狀態', align: 'right', mobilePriority: 'subtitle',
                cell: (o) => <StatusPill status={o.status} /> },
            ] as ResponsiveColumn<DashboardData['pendingSettlementOrders'][number]>[]}
            rows={data!.pendingSettlementOrders}
            getRowKey={(o) => o.orderId}
          />
        </Section>
      )}

      {/* 6-Month Revenue Trend */}
      <Section title="📈 近 6 個月營收趨勢">
        {(!data?.revenueTrend6m?.length) ? (
          <Empty text="暫無趨勢資料" />
        ) : (
          <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 80, marginBottom: 8 }}>
              {(() => {
                const maxGmv = Math.max(...data.revenueTrend6m.map(t => t.gmvTwd), 1);
                return data.revenueTrend6m.map((t) => (
                  <div key={t.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600 }}>
                      {t.gmvTwd > 0 ? `${Math.round(t.gmvTwd / 1000)}K` : ''}
                    </div>
                    <div style={{
                      width: '100%',
                      height: Math.max(4, Math.round((t.gmvTwd / maxGmv) * 60)),
                      background: t.gmvTwd > 0 ? '#7c3aed' : '#e5e7eb',
                      borderRadius: '4px 4px 0 0',
                      minHeight: 4,
                    }} />
                  </div>
                ));
              })()}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {data.revenueTrend6m.map((t) => (
                <div key={t.month} style={{ flex: 1, textAlign: 'center', fontSize: 10, color: '#9ca3af' }}>
                  {t.month.slice(5)}
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {data.revenueTrend6m.map((t) => (
                <div key={t.month} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#374151' }}>
                  <span style={{ color: '#6b7280' }}>{t.month}</span>
                  <span>NT$ {t.gmvTwd.toLocaleString()}</span>
                  <span style={{ color: '#9ca3af' }}>{t.orderCount} 筆</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* Recent Bookings */}
      <Section title="📋 近期訂單">
        {(!data?.pendingBookings?.length) ? (
          <Empty text="尚無訂單" />
        ) : (
          <ResponsiveTable
            columns={[
              { key: 'guest', header: '旅客', mobilePriority: 'title',
                cell: (b: DashboardData['pendingBookings'][number]) => b.guestName },
              { key: 'tour', header: '行程', cell: (b) => b.tourTitle },
              { key: 'party', header: '人數', cell: (b) => `${b.partySize}` },
              { key: 'status', header: '狀態', align: 'right', mobilePriority: 'subtitle',
                cell: (b) => <StatusPill status={b.status} /> },
              { key: 'amount', header: '金額', align: 'right',
                cell: (b) => (
                  <span style={{ fontSize: 13, color: '#374151', whiteSpace: 'nowrap' }}>
                    NT$ {(b.totalTwd ?? 0).toLocaleString()}
                  </span>
                ),
              },
              { key: 'time', header: '時間',
                cell: (b) => (
                  <span style={{ color: '#9ca3af', fontSize: 12 }}>
                    {new Date(b.createdAt).toLocaleDateString('zh-TW')}
                  </span>
                ),
              },
            ] as ResponsiveColumn<DashboardData['pendingBookings'][number]>[]}
            rows={data.pendingBookings}
            getRowKey={(b) => b.id}
          />
        )}
      </Section>

      {/* Upcoming Schedules */}
      <Section title="📅 本週場次">
        {(!data?.upcomingSchedules?.length) ? (
          <Empty text="本週無場次" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.upcomingSchedules.map((s) => (
              <div
                key={s.id}
                onClick={() => openScheduleDetail(s)}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '12px 16px', background: '#fff', borderRadius: 10,
                  border: '1px solid #f3f4f6', cursor: 'pointer',
                  transition: 'box-shadow 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(124,58,237,0.12)')}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{s.tourTitle}</div>
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                    {new Date(s.date).toLocaleDateString('zh-TW', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    {s.planId && ` · ${s.planId}`}
                  </div>
                </div>
                <div style={{ textAlign: 'right', marginLeft: 12 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{s.bookedCount}/{s.maxCapacity}</div>
                  <StatusPill status={s.status} />
                </div>
                <span style={{ marginLeft: 8, color: '#d1d5db', fontSize: 16 }}>›</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Pending Q&A */}
      <Section title="❓ 待回答的問題">
        {qaLoading ? (
          <Empty text="載入中…" />
        ) : pendingQa.length === 0 ? (
          <Empty text="目前沒有待回答的問題" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {pendingQa.map((q) => (
              <div key={q.id} style={{
                padding: '14px 16px',
                background: '#fefce8',
                border: '1px solid #fde68a',
                borderRadius: 10,
              }}>
                <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 6 }}>
                  {isGuideContactActivityId(q.activity_id) ? (
                    <span style={{
                      background: 'rgba(124, 58, 237, 0.1)',
                      color: '#7c3aed',
                      fontSize: 12,
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: 6,
                    }}>👤 導遊頁面</span>
                  ) : (
                    <>行程 ID：<span style={{ fontFamily: 'monospace', fontSize: 12 }}>{q.activity_id}</span></>
                  )}
                  <span style={{ marginLeft: 12, color: '#9ca3af', fontSize: 11 }}>
                    {new Date(q.created_at).toLocaleDateString('zh-TW')}
                  </span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 10 }}>
                  {q.question}
                </div>
                <textarea
                  value={qaAnswerMap[q.id] ?? ''}
                  onChange={(e) => setQaAnswerMap((prev) => ({ ...prev, [q.id]: e.target.value }))}
                  placeholder="填寫回答內容（必填）"
                  rows={3}
                  style={{
                    width: '100%',
                    fontSize: 13,
                    padding: '8px 10px',
                    border: '1px solid #d1d5db',
                    borderRadius: 8,
                    resize: 'vertical',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                  }}
                />
                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => void handleQaAnswer(q.id)}
                    disabled={qaActionLoading === q.id}
                    style={{
                      padding: '8px 18px',
                      borderRadius: 8,
                      border: 'none',
                      background: qaActionLoading === q.id ? '#d1d5db' : '#7c3aed',
                      color: '#fff',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: qaActionLoading === q.id ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {qaActionLoading === q.id ? '送出中...' : '回答並發布'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Payout Detail Modal — ResponsiveModal already provides role=dialog,
          aria-modal, aria-labelledby (via title), and a 關閉 aria-label, so
          the a11y improvements from PR #1066 are preserved. */}
      <ResponsiveModal
        open={!!payoutModal}
        onClose={() => setPayoutModal(null)}
        size="lg"
        title={`${payoutModal ?? ''} 入帳明細`}
        footer={
          <>
            {payoutDetail && payoutDetail.orders.length > 0 && (
              <a
                href={`/api/guide/payout/monthly/csv?month=${payoutModal}`}
                download
                style={{ padding:'7px 14px', background:'#f0fdf4', border:'1px solid #86efac', borderRadius:8, fontSize:12, color:'#16a34a', textDecoration:'none' }}
              >
                下載 CSV
              </a>
            )}
            <button onClick={() => setPayoutModal(null)} style={{ padding:'7px 16px', background:'#f3f4f6', border:'none', borderRadius:8, cursor:'pointer', fontSize:13 }}>關閉</button>
          </>
        }
      >
        {payoutLoading ? (
          <p style={{ color:'#6b7280', fontSize:13 }}>載入中…</p>
        ) : payoutDetail && payoutDetail.orders.length > 0 ? (
          <>
            {/* Financial breakdown table with totals row — kept as a horizontally scrollable
                native table because tfoot totals don't map to a card-list model. */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width:'100%', fontSize:12, borderCollapse:'collapse', minWidth: 480 }}>
                <thead>
                  <tr style={{ color:'#6b7280', borderBottom:'1px solid #e5e7eb' }}>
                    <th scope="col" style={{ textAlign:'left', padding:'4px 6px' }}>行程</th>
                    <th scope="col" style={{ textAlign:'right', padding:'4px 6px' }}>訂單金額</th>
                    <th scope="col" style={{ textAlign:'right', padding:'4px 6px' }}>已退款</th>
                    <th scope="col" style={{ textAlign:'right', padding:'4px 6px' }}>實付扣退款</th>
                    <th scope="col" style={{ textAlign:'right', padding:'4px 6px' }}>平台抽成</th>
                    <th scope="col" style={{ textAlign:'right', padding:'4px 6px' }}>預計入帳</th>
                  </tr>
                </thead>
                <tbody>
                  {payoutDetail.orders.map(o => (
                    <tr key={o.orderId} style={{ borderBottom:'1px solid #f3f4f6' }}>
                      <td style={{ padding:'4px 6px' }}>{o.activityTitle}</td>
                      <td style={{ textAlign:'right', padding:'4px 6px' }}>NT${o.totalTwd.toLocaleString()}</td>
                      <td style={{ textAlign:'right', padding:'4px 6px', color:'#f97316' }}>-NT${o.refundAmountTwd.toLocaleString()}</td>
                      <td style={{ textAlign:'right', padding:'4px 6px' }}>NT${o.effectiveTwd.toLocaleString()}</td>
                      <td style={{ textAlign:'right', padding:'4px 6px', color:'#ef4444' }}>-NT${o.commissionTwd.toLocaleString()}</td>
                      <td style={{ textAlign:'right', padding:'4px 6px', fontWeight:600 }}>NT${o.netTwd.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ fontWeight:700, borderTop:'2px solid #e5e7eb' }}>
                    <td style={{ padding:'6px 6px' }}>合計</td>
                    <td style={{ textAlign:'right', padding:'6px 6px' }}>—</td>
                    <td style={{ textAlign:'right', padding:'6px 6px' }}>—</td>
                    <td style={{ textAlign:'right', padding:'6px 6px' }}>NT${payoutDetail.totals.gmvTwd.toLocaleString()}</td>
                    <td style={{ textAlign:'right', padding:'6px 6px', color:'#ef4444' }}>-NT${payoutDetail.totals.commissionTwd.toLocaleString()}</td>
                    <td style={{ textAlign:'right', padding:'6px 6px' }}>NT${payoutDetail.totals.netTwd.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p style={{ fontSize:11, color:'#9ca3af', marginTop:10 }}>平台抽成 15%，導遊實拿 85%；以旅客實付金額扣除已退款部分後計算，金流手續費平台吸收。</p>
          </>
        ) : (
          <p style={{ color:'#6b7280', fontSize:13 }}>本月尚無可計算訂單</p>
        )}
      </ResponsiveModal>

      {/* Schedule Booking Detail Modal — same a11y story as above. */}
      <ResponsiveModal
        open={!!scheduleModal}
        onClose={() => setScheduleModal(null)}
        size="lg"
        title={scheduleModal?.tourTitle ?? ''}
        footer={
          <button
            onClick={() => setScheduleModal(null)}
            style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            關閉
          </button>
        }
      >
        {scheduleModal && (
          <>
            {/* Header — the tourTitle row is rendered by ResponsiveModal's
                title= prop above, so it's intentionally not repeated here. */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
                📅 {new Date(scheduleModal.date).toLocaleString('zh-TW', { month: 'short', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' })}
                {scheduleModal.planId && ` · ${scheduleModal.planId}`}
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: '#374151' }}>
                  👥 已訂 <strong>{scheduleModal.bookedCount}</strong> / {scheduleModal.maxCapacity} 人
                </span>
                <span style={{ fontSize: 13, color: scheduleModal.bookedCount === 0 ? '#9ca3af' : '#7c3aed' }}>
                  剩餘 {scheduleModal.maxCapacity - scheduleModal.bookedCount} 位
                </span>
              </div>
            </div>

            <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 16, marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 12 }}>
                📋 旅客名單（{scheduleBookings.filter(b => b.status !== 'cancelled_by_user' && b.status !== 'cancelled').length} 位確認）
              </div>

              {scheduleBookingsLoading ? (
                <div style={{ padding: '20px 0', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>載入中…</div>
              ) : scheduleBookings.length === 0 ? (
                <div style={{ padding: '20px 0', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>此場次尚無訂單</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {scheduleBookings.map(b => {
                    const isCancelled = b.status === 'cancelled_by_user' || b.status === 'cancelled';
                    return (
                      <div key={b.id} style={{
                        padding: '12px 14px', borderRadius: 10,
                        background: isCancelled ? '#f9fafb' : '#faf5ff',
                        border: `1px solid ${isCancelled ? '#f3f4f6' : '#ede9fe'}`,
                        opacity: isCancelled ? 0.6 : 1,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                          <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 15, wordBreak: 'break-word' }}>
                              {b.guestName}
                              {isCancelled && <span style={{ marginLeft: 6, fontSize: 11, color: '#9ca3af', fontWeight: 400 }}>（已取消）</span>}
                            </div>
                            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 3 }}>👥 {b.partySize} 人</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 12, fontWeight: 600,
                              color: b.status === 'confirmed' ? '#16a34a' : b.status === 'pending_payment' ? '#d97706' : '#9ca3af'
                            }}>
                              {b.status === 'confirmed' ? '已確認' : b.status === 'pending_payment' ? '待付款' : isCancelled ? '已取消' : b.status}
                            </div>
                            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>NT$ {b.totalTwd.toLocaleString()}</div>
                          </div>
                        </div>
                        {/* Phone - full number for guide */}
                        {b.guestPhone && (
                          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 13, color: '#374151' }}>📞 {b.guestPhone}</span>
                            <button
                              onClick={() => navigator.clipboard.writeText(b.guestPhone)}
                              style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid #e5e7eb', background: '#fff', fontSize: 11, color: '#7c3aed', cursor: 'pointer' }}
                            >
                              複製
                            </button>
                          </div>
                        )}
                        <div style={{ marginTop: 4, fontSize: 12, color: '#9ca3af', wordBreak: 'break-word' }}>{b.maskedEmail}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </ResponsiveModal>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: 14,
      padding: '18px 20px',
      border: '1px solid #f3f4f6',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>{label}</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#1f2937' }}>{value}</div>
        </div>
        <div style={{ fontSize: 28 }}>{icon}</div>
      </div>
    </div>
  );
}

function RevenueCard({ label, value, subtext, icon, muted, onClick }: {
  label: string; value: string; subtext: string; icon: string; muted?: boolean; onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: muted ? '#fafafa' : '#fff',
        borderRadius: 14,
        padding: '18px 20px',
        border: `1px solid ${muted ? '#f3f4f6' : '#ede9fe'}`,
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        cursor: onClick ? 'pointer' : undefined,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>{label}</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: muted ? '#9ca3af' : '#7c3aed' }}>{value}</div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>{subtext}</div>
        </div>
        <div style={{ fontSize: 24, opacity: muted ? 0.4 : 1 }}>{icon}</div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: '18px 20px', border: '1px solid #f3f4f6' }}>
      <h2 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700 }}>{title}</h2>
      {children}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    confirmed: { bg: '#dcfce7', text: '#16a34a' },
    open: { bg: '#dbeafe', text: '#2563eb' },
    full: { bg: '#fef3c7', text: '#d97706' },
    pending_payment: { bg: '#fef9c3', text: '#ca8a04' },
    cancelled: { bg: '#fee2e2', text: '#dc2626' },
    refund_pending: { bg: '#fff7ed', text: '#c2410c' },
  };
  const c = colors[status] || { bg: '#f3f4f6', text: '#6b7280' };
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, background: c.bg, color: c.text, fontSize: 12, fontWeight: 600 }}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div style={{ padding: '24px 0', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>{text}</div>
  );
}
