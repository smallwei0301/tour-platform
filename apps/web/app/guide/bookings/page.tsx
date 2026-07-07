'use client';

import { useEffect, useRef, useState } from 'react';
import { ResponsiveTable, type ResponsiveColumn } from '../../../src/components/admin/responsive';
import { useTablistKeyboard } from '../../../src/lib/use-tablist-keyboard';
import { csrfHeaders, ensureCsrfToken } from '../../../src/lib/csrf-client';

// 三種預約模式：'pending_approval' 是 request plan 的「待審核」分頁，資料源與其他分頁
// 不同（查 bookings 而非 orders），故以 sentinel value 區分渲染。
const PENDING_APPROVAL_TAB = 'pending_approval';
const BOOKINGS_STATUS_TABS = [
  { value: '', label: '全部' },
  { value: PENDING_APPROVAL_TAB, label: '待審核' },
  { value: 'confirmed', label: '已確認' },
  { value: 'pending_payment', label: '待付款' },
  { value: 'cancelled', label: '已取消' },
] as const;
const BOOKINGS_STATUS_VALUES = BOOKINGS_STATUS_TABS.map((t) => t.value);

type PendingApproval = {
  bookingId: string; bookingNo: string; tourTitle: string; planName: string;
  guestName: string; startAt: string | null; partySize: number | null;
  totalTwd: number | null; createdAt: string | null;
};

type Booking = {
  id: string; guestName: string; maskedEmail: string; scheduleDate: string | null;
  planId: string | null; tourTitle: string; partySize: number; status: string;
  paymentStatus: string; totalTwd: number; createdAt: string;
  hasConflictOverride: boolean;
};

// Guide-safe conflict override shape.
// Privacy note: snapshot.adminNote is intentionally absent — never forward to guides.
type ConflictOverride = {
  reason: string | null;
  requiresHelper: boolean;
  helperStatus: string | null;
  guideNote: string | null;
  startAt: string | null;
  endAt: string | null;
};

type BookingDetail = Booking & {
  guestPhone: string; paidAt: string | null; adminNote: string | null;
  schedule: { date: string; endAt: string; planId: string; capacity: number; bookedCount: number } | null;
  conflictOverride: ConflictOverride | null;
};

const STATUS_LABELS: Record<string, string> = {
  pending_payment: '待付款', confirmed: '已確認', cancelled: '已取消', refunded: '已退款',
};

const HELPER_STATUS_LABELS: Record<string, string> = {
  required: '需要協助', assigned: '已指派', not_needed: '不需要',
};

function StatusPill({ status }: { status: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600,
      background: status === 'confirmed' ? '#dcfce7' : status === 'pending_payment' ? '#fef9c3' : '#fee2e2',
      color: status === 'confirmed' ? '#16a34a' : status === 'pending_payment' ? '#ca8a04' : '#dc2626',
    }}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

/** Compact warning badge shown in the list row when conflict override is present. */
function ConflictBadge() {
  return (
    <span
      aria-label="管理者例外開放"
      title="此訂單為管理者例外開放的時間衝突場次"
      style={{
        display: 'inline-block', padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700,
        background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', marginLeft: 4,
        verticalAlign: 'middle', lineHeight: '18px',
      }}
    >
      ⚠ 例外開放
    </span>
  );
}

/** Warning section rendered inside the detail modal. */
function ConflictOverrideWarning({ override }: { override: ConflictOverride }) {
  return (
    <div
      role="note"
      aria-label="管理者例外開放通知"
      style={{
        background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 14px',
        marginBottom: 8,
      }}
    >
      <div style={{ fontWeight: 700, color: '#b45309', fontSize: 13, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
        ⚠ 管理者例外開放
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <span style={{ color: '#92400e', width: 72, flexShrink: 0 }}>原因</span>
          <span style={{ fontWeight: 500 }}>{override.reason || '—'}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <span style={{ color: '#92400e', width: 72, flexShrink: 0 }}>時間衝突</span>
          <span style={{ fontWeight: 500 }}>是（此場次與其他行程時段重疊）</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <span style={{ color: '#92400e', width: 72, flexShrink: 0 }}>需要助手</span>
          <span style={{ fontWeight: 500 }}>
            {override.requiresHelper ? '是' : '否'}
            {override.requiresHelper && override.helperStatus && (
              <span style={{ marginLeft: 6, color: '#6b7280', fontSize: 12 }}>
                （{HELPER_STATUS_LABELS[override.helperStatus] || override.helperStatus}）
              </span>
            )}
          </span>
        </div>
        {override.guideNote && (
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={{ color: '#92400e', width: 72, flexShrink: 0 }}>給導遊的備注</span>
            <span style={{ fontWeight: 500 }}>{override.guideNote}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function GuideBookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<BookingDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const tabKb = useTablistKeyboard(BOOKINGS_STATUS_VALUES, statusFilter, setStatusFilter);
  // 三種預約模式：待審核（request plan）
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [actingApproval, setActingApproval] = useState<string>('');
  const [approvalError, setApprovalError] = useState<string>('');
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const detailRequestIdRef = useRef(0);
  const detailDialogOpen = selected !== null || detailLoading;

  useEffect(() => {
    fetch('/api/v2/guide/bookings')
      .then((r) => r.json())
      .then((json) => setBookings(json?.data || []))
      .finally(() => setLoading(false));
    void ensureCsrfToken();
  }, []);

  async function loadPendingApprovals() {
    setPendingLoading(true);
    setApprovalError('');
    try {
      const res = await fetch('/api/v2/guide/bookings/pending-approval', { cache: 'no-store' });
      const json = await res.json();
      setPendingApprovals(Array.isArray(json?.data) ? json.data : []);
    } catch {
      setApprovalError('載入待審核清單失敗，請重試');
    } finally {
      setPendingLoading(false);
    }
  }

  useEffect(() => {
    if (statusFilter === PENDING_APPROVAL_TAB) void loadPendingApprovals();
  }, [statusFilter]);

  async function decideApproval(bookingId: string, action: 'approve' | 'reject') {
    if (action === 'reject' && !confirm('確定婉拒這筆預約申請？申請將被取消，旅客會收到通知。')) return;
    setActingApproval(bookingId);
    setApprovalError('');
    try {
      const res = await fetch(`/api/v2/guide/bookings/${encodeURIComponent(bookingId)}/approval`, {
        method: 'POST',
        headers: csrfHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok || json?.error) throw new Error(json?.error?.message || '操作失敗');
      await loadPendingApprovals();
    } catch (error) {
      setApprovalError(error instanceof Error ? error.message : '操作失敗，請重試');
    } finally {
      setActingApproval('');
    }
  }

  async function openDetail(id: string, trigger?: HTMLElement | null) {
    if (trigger) triggerRef.current = trigger;
    const requestId = detailRequestIdRef.current + 1;
    detailRequestIdRef.current = requestId;
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/v2/guide/bookings/${id}`);
      const json = await res.json();
      if (detailRequestIdRef.current !== requestId) return;
      if (json?.data) setSelected(json.data);
    } finally {
      if (detailRequestIdRef.current === requestId) {
        setDetailLoading(false);
      }
    }
  }

  function closeDetail() {
    detailRequestIdRef.current += 1;
    setDetailLoading(false);
    setSelected(null);
  }

  useEffect(() => {
    if (!detailDialogOpen) {
      if (triggerRef.current && document.contains(triggerRef.current)) {
        triggerRef.current.focus();
      }
      return;
    }

    const dialog = dialogRef.current;
    if (!(dialog instanceof HTMLElement)) return;
    const dialogEl: HTMLElement = dialog;

    const focusables = getFocusableElements(dialogEl);
    const initialFocus = closeButtonRef.current || focusables[0] || dialogEl;
    initialFocus.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDetail();
        return;
      }

      if (event.key !== 'Tab') return;

      const currentFocusables = getFocusableElements(dialogEl);
      if (currentFocusables.length === 0) {
        event.preventDefault();
        dialogEl.focus();
        return;
      }

      const first = currentFocusables[0];
      const last = currentFocusables[currentFocusables.length - 1];
      const active = document.activeElement;

      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (active instanceof HTMLElement && !dialogEl.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [detailDialogOpen, detailLoading, selected]);

  const filtered = bookings.filter((b) => !statusFilter || b.status === statusFilter);

  const columns: ResponsiveColumn<Booking>[] = [
    {
      key: 'guest',
      header: '旅客',
      mobilePriority: 'title',
      cell: (b) => (
        <>
          <div style={{ fontWeight: 600 }}>{b.guestName}</div>
          <div style={{ fontSize: 11, color: '#9ca3af' }}>{b.maskedEmail}</div>
        </>
      ),
    },
    {
      key: 'tour',
      header: '行程',
      cell: (b) => (
        <>
          {b.tourTitle}
          {b.hasConflictOverride && <ConflictBadge />}
        </>
      ),
    },
    {
      key: 'date',
      header: '場次日期',
      cell: (b) => (
        <span style={{ fontSize: 13 }}>
          {b.scheduleDate ? new Date(b.scheduleDate).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' }) : '-'}
        </span>
      ),
    },
    { key: 'party', header: '人數', cell: (b) => `${b.partySize}` },
    {
      key: 'amount',
      header: '金額',
      align: 'right',
      cell: (b) => <span style={{ fontWeight: 600 }}>NT$ {b.totalTwd.toLocaleString()}</span>,
    },
    {
      key: 'status',
      header: '狀態',
      align: 'right',
      mobilePriority: 'subtitle',
      cell: (b) => <StatusPill status={b.status} />,
    },
    // Whole row/card is tappable — drop the redundant 詳情 button on mobile.
    {
      key: 'action',
      header: '操作',
      align: 'right',
      mobilePriority: 'hidden',
      cell: (b) => (
        <button
          onClick={(e) => { e.stopPropagation(); openDetail(b.id, e.currentTarget); }}
          style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', fontSize: 12, cursor: 'pointer' }}
        >
          詳情
        </button>
      ),
    },
  ];

  const pendingColumns: ResponsiveColumn<PendingApproval>[] = [
    {
      key: 'guest',
      header: '旅客',
      mobilePriority: 'title',
      cell: (r) => <div style={{ fontWeight: 600 }}>{r.guestName}</div>,
    },
    { key: 'tour', header: '行程', cell: (r) => <span>{r.tourTitle}{r.planName ? `／${r.planName}` : ''}</span> },
    {
      key: 'date',
      header: '預約時段',
      cell: (r) => (
        <span style={{ fontSize: 13 }}>
          {r.startAt ? new Date(r.startAt).toLocaleString('zh-TW', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
        </span>
      ),
    },
    { key: 'party', header: '人數', cell: (r) => `${r.partySize ?? '-'}` },
    {
      key: 'amount',
      header: '金額',
      align: 'right',
      cell: (r) => <span style={{ fontWeight: 600 }}>{r.totalTwd != null ? `NT$ ${r.totalTwd.toLocaleString()}` : '-'}</span>,
    },
    {
      key: 'action',
      header: '審核',
      align: 'right',
      cell: (r) => (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button
            onClick={() => decideApproval(r.bookingId, 'approve')}
            disabled={actingApproval === r.bookingId}
            style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: '#16a34a', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: actingApproval === r.bookingId ? 0.6 : 1 }}
          >
            {actingApproval === r.bookingId ? '處理中…' : '批准'}
          </button>
          <button
            onClick={() => decideApproval(r.bookingId, 'reject')}
            disabled={actingApproval === r.bookingId}
            style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: actingApproval === r.bookingId ? 0.6 : 1 }}
          >
            婉拒
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <h1 style={{ margin: '0 0 16px', fontSize: 20, fontWeight: 800 }}>📋 訂單查看</h1>

      {/* Filter — role=tablist/aria-selected from PR #1057 + ArrowRight/Left
          keyboard nav from #1113. */}
      <div role="tablist" aria-label="預約狀態篩選" style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {BOOKINGS_STATUS_TABS.map((f, i) => (
          <button
            key={f.value}
            ref={tabKb.registerTab(i)}
            role="tab"
            aria-selected={statusFilter === f.value}
            onClick={() => setStatusFilter(f.value)}
            onKeyDown={tabKb.onKeyDown}
            style={{
              padding: '7px 16px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              background: statusFilter === f.value ? '#7c3aed' : '#f3f4f6',
              color: statusFilter === f.value ? '#fff' : '#6b7280',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {statusFilter === PENDING_APPROVAL_TAB ? (
        <div>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 12px' }}>
            「申請預約」行程的待審核申請。通過後旅客才會收到付款通知；婉拒則取消申請、通知旅客（此階段尚未收費）。
          </p>
          {approvalError && <p style={{ color: 'crimson', fontSize: 13 }}>{approvalError}</p>}
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f3f4f6', overflow: 'hidden' }}>
            <ResponsiveTable<PendingApproval>
              columns={pendingColumns}
              rows={pendingApprovals}
              getRowKey={(r) => r.bookingId}
              loading={pendingLoading}
              emptyMessage="目前沒有待審核的預約申請"
            />
          </div>
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f3f4f6', overflow: 'hidden' }}>
          <ResponsiveTable<Booking>
            columns={columns}
            rows={filtered}
            getRowKey={(b) => b.id}
            onRowClick={(b) => openDetail(b.id)}
            loading={loading}
            emptyMessage="無訂單資料"
          />
        </div>
      )}

      {/* Detail Modal — kept as a hand-rolled dialog because PR #1066's
          source-grep a11y tests assert on the literal markup (dialogRef,
          closeButtonRef, role="dialog", focus-trap effect, Tab/Escape
          handlers). The RWD adjustment here is the panel sizing:
          width clamps to the viewport and maxHeight uses 100dvh so the
          modal never overflows a 375-wide phone. */}
      {detailDialogOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}
          onClick={() => !detailLoading && closeDetail()}
        >
          <div
            ref={dialogRef}
            role="dialog" aria-modal="true" aria-labelledby="booking-detail-modal-title" tabIndex={-1}
            style={{ background: '#fff', borderRadius: 16, padding: 28, width: 'min(500px, calc(100vw - 24px))', maxHeight: 'calc(100dvh - 24px)', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {detailLoading ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>載入中…</div>
            ) : selected && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h3 id="booking-detail-modal-title" style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>訂單詳情</h3>
                  <button ref={closeButtonRef} aria-label="關閉" onClick={closeDetail} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
                </div>

                {/* Conflict override warning — shown only when admin opened a conflicting slot */}
                {selected.conflictOverride && (
                  <ConflictOverrideWarning override={selected.conflictOverride} />
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14 }}>
                  <InfoRow label="旅客姓名" value={selected.guestName} />
                  <InfoRow
                    label="手機號碼"
                    value={
                      <span>
                        {selected.guestPhone || '無'}
                        {selected.guestPhone && (
                          <button
                            onClick={() => navigator.clipboard.writeText(selected.guestPhone)}
                            style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 4, border: '1px solid #e5e7eb', background: '#f9fafb', fontSize: 11, cursor: 'pointer' }}
                          >
                            📋 複製
                          </button>
                        )}
                      </span>
                    }
                  />
                  <InfoRow label="Email" value={selected.maskedEmail} />
                  <InfoRow label="行程" value={selected.tourTitle} />
                  <InfoRow label="場次日期" value={selected.schedule ? new Date(selected.schedule.date).toLocaleString('zh-TW') : '-'} />
                  <InfoRow label="人數" value={`${selected.partySize} 人`} />
                  <InfoRow label="金額" value={`NT$ ${selected.totalTwd.toLocaleString()}`} />
                  <InfoRow label="訂單狀態" value={STATUS_LABELS[selected.status] || selected.status} />
                  <InfoRow label="付款狀態" value={selected.paymentStatus === 'paid' ? `✅ 已付款（${new Date(selected.paidAt!).toLocaleString('zh-TW')}）` : '⏳ 未付款'} />
                  {selected.adminNote && <InfoRow label="管理員備註" value={selected.adminNote} />}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function getFocusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute('disabled') && !element.getAttribute('aria-hidden'));
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '6px 0', borderBottom: '1px solid #f3f4f6', flexWrap: 'wrap' }}>
      <div style={{ width: 90, flexShrink: 0, color: '#6b7280', fontSize: 13 }}>{label}</div>
      <div style={{ fontWeight: 500, flex: '1 1 200px', minWidth: 0, wordBreak: 'break-word' }}>{value}</div>
    </div>
  );
}
