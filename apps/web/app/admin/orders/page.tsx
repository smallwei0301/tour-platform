'use client';

/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useMemo, useState } from 'react';
import { Card, PageHeader, StatusBadge, Select } from '../../../src/components/admin/ui';
import { ResponsiveTable, ResponsiveModal, useIsMobile, type ResponsiveColumn } from '../../../src/components/admin/responsive';
import { csrfHeaders } from '../../../src/lib/csrf-client';

type Row = {
  id: string; status: string; sourceChannel?: string | null; totalTwd: number; costTwd: number; marginTwd: number;
  title?: string | null; peopleCount?: number; contactName?: string | null;
  contactEmail?: string | null; createdAt?: string | null; paidAt?: string | null; adminNote?: string | null;
  trade_no?: string | null;
};

// 訂單來源通路（含外部佔位轉成的 external 訂單；external_hold 佔位本身無 order，不在此列表）。
const SOURCE_CHANNELS = ['web', 'line', 'admin_pos', 'external'];
const SOURCE_LABELS: Record<string, string> = {
  web: '官網',
  line: 'LINE',
  admin_pos: '後台 POS',
  external: '外部通路',
};

const ORDER_STATUSES = ['pending_payment','paid','confirmed','rejected','cancelled_by_user','cancelled_by_guide','completed','refund_pending','refunded'];

// 可執行「取消＋退款」的訂單狀態（與後端 cancelOrderAdminDb 的 CANCELLABLE 一致）。
const CANCELLABLE_STATUSES = ['pending_payment', 'paid', 'confirmed', 'rejected'];

// 防呆：這些終端狀態不得由「狀態下拉」手動設定（與後端 updateAdminOrderDb 一致）。
// 取消／退款須走「取消＋退款」按鈕、退款執行或旅客退款申請等專用流程。
const MANUAL_BLOCKED_STATUSES = ['cancelled_by_user', 'cancelled_by_guide', 'refund_pending', 'refunded'];

// 金流／退款處理使用說明頁（ECPay vs 現金、正常流程與異常處理）。
const PAYMENTS_REFUNDS_GUIDE_HREF = '/admin/help/payments-refunds';

// 退款執行錯誤碼 → 維運看得懂的說明（refund-execute route 回傳的 error.code）。
const REFUND_ERROR_HINTS: Record<string, string> = {
  INVALID_STATUS: '訂單目前狀態無法執行退款（需為「退款中」，或已有退款／沖銷記錄）。',
  NOT_FOUND: '找不到此訂單。',
  REASON_REQUIRED: '現金訂單必須填寫退款原因。',
  PAYMENT_NOT_REVERSIBLE: '找不到可沖銷的付款紀錄，或有多筆無法判定（請改用「退款管理」人工處理）。',
  ECPAY_QUERY_FAILED: '向 ECPay 查詢交易狀態失敗，請稍後再試或改走人工退款。',
  ECPAY_STATE_UNKNOWN: 'ECPay 交易狀態不明／不一致，已擋下自動沖銷以免重複退款。',
  ECPAY_REVERSAL_FAILED: 'ECPay 沖銷失敗，請稍後再試或改走人工退款。',
  ECPAY_REFUND_FAILED: 'ECPay 退款失敗，請稍後再試或改走人工退款。',
  DB_UPDATE_FAILED: '資料庫寫入失敗，退款未完成，請重試。',
  UNAUTHORIZED: '登入已逾期或權限不足，請重新登入後再試。',
  INVALID_REFUND_AMOUNT: '退款金額需為大於 0 的整數（新台幣）。',
  REFUND_AMOUNT_EXCEEDS_TOTAL: '退款金額不可超過訂單總額。',
  PARTIAL_REFUND_UNSUPPORTED: '此筆為授權未請款，只能全額取消授權；部分退款需先完成請款。請改填全額或改走人工處理。',
};

const STATUS_LABELS: Record<string, string> = {
  pending_payment: '待付款',
  paid: '已付款',
  confirmed: '已確認',
  rejected: '已拒絕',
  cancelled_by_user: '用戶取消',
  cancelled_by_guide: '導遊取消',
  completed: '已完成',
  refund_pending: '退款中',
  refunded: '已退款',
};

// 狀態連動標記（依「後台手動切換狀態」實際觸發的真實 API 連動標註）。
//  💬 影響 LINE／Telegram 通知發送
//      （src/lib/admin-order-event-kind.mjs → adminStatusToTelegramKind；
//       PATCH /api/admin/orders/[orderId] 會 fan-out 旅客＋導遊＋管理群組）
//  💰 觸發自動推進下一步／出帳結算
//      （src/lib/post-trip/payout-eligibility.mjs → 僅 completed 進入 settlement sweep）
// 其他連動以圖標標註，圖例見 STATUS_MARK_LEGEND。
const STATUS_MARK_LEGEND =
  '標記說明： 💬 影響 LINE／Telegram 通知　💰 觸發出帳／結算　🔒 切換後鎖定不可再編輯　💳 連動付款狀態　📊 計入 GMV 統計　💸 退款連動　⭐ 觸發行程後評價邀請';

const STATUS_MARKS: Record<string, string> = {
  pending_payment: '💳',
  paid: '💬 💳 📊',
  confirmed: '📊',
  rejected: '💬',
  cancelled_by_user: '💬 🔒',
  cancelled_by_guide: '💬 🔒',
  completed: '💰 🔒 ⭐',
  refund_pending: '💬 🔒 💸',
  refunded: '💬 🔒 💸',
};

// 每個狀態切換後的真實連動說明（顯示於訂單詳情，協助維運判斷後果）。
const STATUS_EFFECTS: Record<string, string> = {
  pending_payment:
    '訂單初始狀態：占用名額等待付款。' +
    '\n💳 付款狀態同步：payment_status 重置為 pending、清除 paid_at 時間戳。' +
    '\n⚠️ 無法手動切換到此狀態；若目前是 locked 狀態（已完成、已取消、退款中等）無法編輯。',

  paid:
    '💬 LINE／Telegram 通知：發送「已付款」給旅客、導遊、管理群組（受綁定＋通知矩陣開關約束）。' +
    '\n💳 付款狀態同步：payment_status → paid，paid_at 設為系統當前時間。' +
    '\n📊 GMV 統計：金額計入平台 GMV 與導遊 30 日回收額計算。' +
    '\n✏️ 可繼續編輯狀態、備註、聯絡方式、人數等欄位。尚未進入出帳。',

  confirmed:
    '已確認名額，可標記完成的前置狀態。' +
    '\n💳 付款狀態：不影響 payment_status（保持現有值）。' +
    '\n📊 GMV 統計：金額已計入。' +
    '\n✏️ 可繼續編輯。不發送任何 LINE／Telegram 通知。',

  rejected:
    '訂單被拒絕。' +
    '\n💬 LINE／Telegram 通知：發送「訂單已取消」給旅客、導遊、管理群組。' +
    '\n💳 付款狀態：不變更。' +
    '\n❌ 不列入行程後評價邀請。' +
    '\n✏️ 訂單保持可編輯。',

  cancelled_by_user:
    '旅客取消訂單。' +
    '\n💬 LINE／Telegram 通知：發送「訂單已取消」給旅客、導遊、管理群組。' +
    '\n🔒 訂單鎖定：切換後立即進入 terminal 狀態，無法再編輯狀態、備註、聯絡方式、人數。' +
    '\n❌ 拒絕名額釋放與自動退款：此下拉只改狀態，不會自動釋放名額或建立退款 entry。請使用「取消＋退款」按鈕或專用 API。',

  cancelled_by_guide:
    '導遊取消訂單。' +
    '\n💬 LINE／Telegram 通知：發送「訂單已取消」給旅客、導遊、管理群組。' +
    '\n🔒 訂單鎖定：切換後立即進入 terminal 狀態，無法再編輯。' +
    '\n❌ 拒絕名額釋放與自動退款：此下拉只改狀態。釋放名額並建立全額退款 entry 需由專用「取消＋退款」API 完成。',

  completed:
    '行程已完成，最後一個「活躍」狀態。' +
    '\n💰 出帳資格：唯一被結算 sweep（/api/internal/settlement/sweep）納入候選的狀態。需滿足：無退款、無投訴、無安全等 hold 才能實際出帳；滿足條件後導遊 payout = (總額 - 已退款) × 85%。' +
    '\n⭐ 評價邀請：觸發「行程後評價邀請」流程（需活動已結束、無爭議／投訴／退款）。' +
    '\n🔒 訂單鎖定：切換後立即進入 terminal 狀態，無法再改狀態、備註、聯絡方式、人數。' +
    '\n💬 不發送即時 LINE／Telegram 通知。',

  refund_pending:
    '退款申請中，進入退款流程。' +
    '\n💬 LINE／Telegram 通知：發送「退款申請中」給旅客、導遊、管理群組。' +
    '\n🔒 訂單鎖定：切換後立即進入 terminal 狀態，無法再編輯。' +
    '\n💸 Payout Hold：該筆訂單的 payout 立即進入 hold（refund_pending）狀態，結算 sweep 會排除。' +
    '\n🔓 解鎖「執行退款」按鈕：允許維運在訂單詳情下方點擊執行 ECPay 全額退款（或手動標記現金退款）。',

  refunded:
    '退款已完成，最終狀態。' +
    '\n💬 LINE／Telegram 通知：發送「退款完成」給旅客、導遊、管理群組。' +
    '\n🔒 訂單鎖定：完全 terminal，無法再編輯。' +
    '\n💸 Payout 反向沖銷：已出帳部分以有效金額（總額 - 已退款）反向沖銷；全額退款則整筆排除於出帳，導遊零 payout。',
};

export default function AdminOrdersPage() {
  const isMobile = useIsMobile(768);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [sourceChannel, setSourceChannel] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<Row | null>(null);
  const [editStatus, setEditStatus] = useState('');
  const [editNote, setEditNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [exceptionAction, setExceptionAction] = useState<'reschedule'|'adjust_capacity'|'oversell_fix'>('reschedule');
  const [targetScheduleId, setTargetScheduleId] = useState('');
  const [newCapacity, setNewCapacity] = useState('');
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [exceptionBusy, setExceptionBusy] = useState(false);
  const [refundReason, setRefundReason] = useState('');
  // 部分退款：留空＝全額退款；可填較小金額（≤ 訂單總額）做部分退款。
  const [refundAmount, setRefundAmount] = useState('');
  const [isExecutingRefund, setIsExecutingRefund] = useState(false);
  const [refundExecuted, setRefundExecuted] = useState(false);
  const [refundError, setRefundError] = useState('');
  // 取消＋退款（一次性：取消訂單→釋放名額→建立全額退款 entry）
  const [cancelRefundBusy, setCancelRefundBusy] = useState(false);
  const [cancelRefundError, setCancelRefundError] = useState('');
  const [cancelRefundDone, setCancelRefundDone] = useState(false);
  // #1411 — 訂單留言串（admin 第一期唯讀）
  const [orderMessages, setOrderMessages] = useState<any[]>([]);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (sourceChannel) params.set('sourceChannel', sourceChannel);
      const q = params.toString() ? `?${params.toString()}` : '';
      const res = await fetch(`/api/admin/orders${q}`, { cache: 'no-store' });
      const j = await res.json().catch(() => null);
      // 「讀取失敗」與「沒有訂單」必須可分辨：失敗時不得靜默渲染空表，
      // 否則會被誤讀為訂單全部消失。
      if (!res.ok || !j?.ok || !Array.isArray(j?.data)) {
        const code = j?.error?.code ? `（${j.error.code}）` : `（HTTP ${res.status}）`;
        setRows([]);
        setLoadError(`訂單資料載入失敗${code}，目前清單非即時狀態，請重試或稍後再試。`);
        return;
      }
      setRows(j.data);
    } catch {
      setRows([]);
      setLoadError('訂單資料載入失敗（網路錯誤），請重試或稍後再試。');
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [status, sourceChannel]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); setTimeline([]); return; }
    setRefundReason('');
    setRefundAmount('');
    setRefundExecuted(false);
    setRefundError('');
    setSaveError('');
    setCancelRefundBusy(false);
    setCancelRefundError('');
    setCancelRefundDone(false);
    fetch(`/api/admin/orders/${encodeURIComponent(selectedId)}`, { cache: 'no-store' })
      .then(r => r.json()).then(j => { setDetail(j.data||null); setEditStatus(j.data?.status||''); setEditNote(j.data?.adminNote||''); }).catch(() => setDetail(null));
    fetch(`/api/admin/orders/${encodeURIComponent(selectedId)}/audit-logs`, { cache: 'no-store' })
      .then(r => r.json()).then(j => setAuditLogs(j.data||[])).catch(() => setAuditLogs([]));
    fetch(`/api/admin/orders/${encodeURIComponent(selectedId)}/timeline`, { cache: 'no-store' })
      .then(r => r.json()).then(j => setTimeline(j.data?.timeline||[])).catch(() => setTimeline([]));
    fetch(`/api/admin/orders/${encodeURIComponent(selectedId)}/messages`, { cache: 'no-store' })
      .then(r => r.json()).then(j => setOrderMessages(j.data?.messages||[])).catch(() => setOrderMessages([]));
  }, [selectedId]);

  const filtered = useMemo(() => rows, [rows]);

  async function executeRefund(orderId: string) {
    // 部分退款：前端先做基本驗證（>0 整數、≤ 訂單總額），錯誤即時提示、不打 API。
    const total = Number(detail?.totalTwd ?? 0);
    const trimmedAmount = refundAmount.trim();
    let parsedAmount: number | undefined;
    if (trimmedAmount) {
      const n = Number(trimmedAmount);
      if (!Number.isInteger(n) || n <= 0) {
        setRefundError('退款金額需為大於 0 的整數（新台幣）。留空＝全額退款。');
        return;
      }
      if (total > 0 && n > total) {
        setRefundError(`退款金額不可超過訂單總額 NT$${total.toLocaleString()}。`);
        return;
      }
      parsedAmount = n;
    }

    setIsExecutingRefund(true);
    setRefundError('');
    try {
      const body: Record<string, unknown> = detail?.trade_no ? {} : { reason: refundReason };
      if (parsedAmount !== undefined) body.refundAmount = parsedAmount;
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}/refund-execute`, {
        method: 'POST',
        headers: csrfHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.ok !== false) {
        setRefundExecuted(true);
        await load();
        const dr = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}`, { cache: 'no-store' });
        setDetail((await dr.json()).data || null);
      } else {
        // 防呆：顯示真正的錯誤碼／訊息，而非死的「退款執行失敗」。
        const code = j?.error?.code as string | undefined;
        const hint = code ? REFUND_ERROR_HINTS[code] : undefined;
        const detailMsg = j?.error?.message ? `（${j.error.message}）` : `（HTTP ${res.status}）`;
        setRefundError(`退款執行失敗：${hint || code || '未知錯誤'}${detailMsg}`);
      }
    } catch {
      setRefundError('退款執行失敗：網路錯誤，請重試。');
    } finally {
      setIsExecutingRefund(false);
    }
  }

  // 取消＋退款：一次完成「取消訂單→釋放名額→建立全額退款 entry（refunded）」。
  // 對應 POST /api/admin/orders/:orderId/cancel，避免維運手動改狀態造成孤兒訂單。
  async function cancelAndRefund(orderId: string) {
    if (!window.confirm('確定要「取消並全額退款」這筆訂單？\n此操作會釋放名額、建立退款記錄並把訂單設為已退款，無法復原。')) {
      return;
    }
    setCancelRefundBusy(true);
    setCancelRefundError('');
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}/cancel`, {
        method: 'POST',
        headers: csrfHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ adminNote: editNote || 'admin cancel + refund' }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.ok !== false) {
        setCancelRefundDone(true);
        await load();
        const dr = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}`, { cache: 'no-store' });
        const dj = await dr.json();
        setDetail(dj.data || null);
        setEditStatus(dj.data?.status || '');
      } else {
        const code = j?.error?.code as string | undefined;
        const msg = j?.error?.message ? `（${j.error.message}）` : `（HTTP ${res.status}）`;
        setCancelRefundError(`取消＋退款失敗：${code || '未知錯誤'}${msg}`);
      }
    } catch {
      setCancelRefundError('取消＋退款失敗：網路錯誤，請重試。');
    } finally {
      setCancelRefundBusy(false);
    }
  }

  async function applyException() {
    if (!selectedId) return;
    setExceptionBusy(true);
    try {
      await fetch(`/api/admin/orders/${encodeURIComponent(selectedId)}/exceptions`, {
        method: 'POST', headers: csrfHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ action: exceptionAction, targetScheduleId: targetScheduleId||undefined, newCapacity: newCapacity?Number(newCapacity):undefined, adminNote: editNote }),
      });
      await load();
      const [dr, lr] = await Promise.all([
        fetch(`/api/admin/orders/${encodeURIComponent(selectedId)}`, { cache: 'no-store' }),
        fetch(`/api/admin/orders/${encodeURIComponent(selectedId)}/audit-logs`, { cache: 'no-store' }),
      ]);
      setDetail((await dr.json()).data||null);
      setAuditLogs((await lr.json()).data||[]);
    } finally { setExceptionBusy(false); }
  }

  async function saveDetail() {
    if (!selectedId) return;
    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(selectedId)}`, {
        method: 'PATCH', headers: csrfHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ status: editStatus, adminNote: editNote }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || j?.ok === false) {
        // 防呆：把後端的擋下原因（如 MANUAL_STATUS_CHANGE_BLOCKED）顯示出來。
        setSaveError(j?.error?.message || `儲存失敗（HTTP ${res.status}）`);
        return;
      }
      await load();
      const dr = await fetch(`/api/admin/orders/${encodeURIComponent(selectedId)}`, { cache: 'no-store' });
      const dj = await dr.json();
      setDetail(dj.data || null);
      setEditStatus(dj.data?.status || '');
    } catch {
      setSaveError('儲存失敗：網路錯誤，請重試。');
    } finally { setSaving(false); }
  }

  const inputStyle: React.CSSProperties = { width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 10px', fontSize: 13, marginTop: 4, outline: 'none', boxSizing: 'border-box' };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 14 };
  const btnStyle = (variant: 'primary'|'secondary'|'danger' = 'primary'): React.CSSProperties => ({
    padding: '8px 16px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    background: variant === 'primary' ? 'var(--tp-primary)' : variant === 'danger' ? '#ef4444' : '#f1f5f9',
    color: variant === 'secondary' ? '#374151' : '#fff',
  });

  const orderColumns: ResponsiveColumn<Row>[] = [
    {
      key: 'id', header: 'Order ID', mobilePriority: 'hidden',
      cell: (r) => <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#6b7280' }}>{r.id.slice(0, 12)}…</span>,
    },
    {
      key: 'status', header: '狀態', mobilePriority: 'subtitle',
      cell: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: 'source', header: '來源', mobilePriority: 'hidden',
      cell: (r) => {
        const ch = r.sourceChannel || 'web';
        const isExternal = ch === 'external';
        return (
          <span
            data-testid="admin-order-source"
            title={isExternal ? '外部通路（OTA／電話／走客）來源訂單' : undefined}
            style={{ fontSize: 12, fontWeight: 600, color: isExternal ? '#b45309' : '#6b7280' }}
          >
            {SOURCE_LABELS[ch] ?? ch}
          </span>
        );
      },
    },
    {
      key: 'title', header: '行程', mobilePriority: 'title',
      cell: (r) => <span style={{ fontSize: 13 }}>{r.title || '-'}</span>,
    },
    {
      key: 'total', header: '金額', align: 'right', mobileLabel: '金額',
      cell: (r) => <strong>NT${r.totalTwd.toLocaleString()}</strong>,
    },
    {
      key: 'margin', header: '毛利', align: 'right', mobileLabel: '毛利',
      cell: (r) => <span style={{ color: r.marginTwd >= 0 ? '#15803d' : '#dc2626', fontWeight: 600 }}>NT${r.marginTwd.toLocaleString()}</span>,
    },
  ];

  // 訂單詳情主體：桌機放在右側面板、手機用彈出視窗呈現，共用同一份 JSX。
  // 手機版的標題與關閉鈕由 ResponsiveModal 提供，這裡的標題列只在桌機顯示。
  const detailBody = !detail ? null : (
    <>
      {!isMobile && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>訂單詳情</h3>
          <StatusBadge status={detail.status} />
        </div>
      )}

      <div style={{ fontSize: 13, color: '#374151', lineHeight: 2, background: '#f9fafb', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
        <div><strong>ID：</strong><span style={{ fontFamily: 'monospace', fontSize: 12 }}>{detail.id}</span></div>
        <div><strong>行程：</strong>{detail.title || '-'}</div>
        <div><strong>聯絡人：</strong>{detail.contactName || '-'}（{detail.contactEmail || '-'}）</div>
        <div><strong>人數：</strong>{detail.peopleCount || 1} 人</div>
        <div><strong>總額：</strong>NT${Number(detail.totalTwd||0).toLocaleString()}</div>
        <div><strong>建立：</strong>{detail.createdAt ? new Date(detail.createdAt).toLocaleString('zh-TW') : '-'}</div>
        <div><strong>付款：</strong>{detail.paidAt ? new Date(detail.paidAt).toLocaleString('zh-TW') : '-'}</div>
      </div>

      <a
        data-guide="payments-refunds-guide-link"
        href={PAYMENTS_REFUNDS_GUIDE_HREF}
        target="_blank"
        rel="noopener noreferrer"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#1d4ed8', textDecoration: 'none', marginBottom: 4 }}
      >
        📖 金流／退款處理說明（ECPay vs 現金、正常與異常流程）
      </a>

      <label htmlFor="admin-order-status" style={labelStyle}>狀態</label>
      <Select id="admin-order-status" value={editStatus} onChange={setEditStatus}>
        {ORDER_STATUSES.map(s => {
          const blocked = MANUAL_BLOCKED_STATUSES.includes(s);
          return (
            <option key={s} value={s} disabled={blocked}>
              {STATUS_LABELS[s] ?? s}{STATUS_MARKS[s] ? `　${STATUS_MARKS[s]}` : ''}{blocked ? '（不可手動設定）' : ''}
            </option>
          );
        })}
      </Select>
      {/* 防呆說明：取消／退款相關狀態不可由下拉手動設定。 */}
      <p data-guide="manual-status-blocked-hint" style={{ margin: '6px 0 0', fontSize: 12, color: '#92400e', lineHeight: 1.6 }}>
        ⚠️ 「用戶取消／導遊取消／退款中／已退款」不可由此下拉設定（已停用）。取消或退款請用下方「<strong>取消＋退款</strong>」按鈕，或退款中訂單的「執行退款」。
      </p>

      {/* 選定狀態的真實連動說明 — 切換前先看清楚會觸發什麼（通知／出帳／鎖定…）。 */}
      {STATUS_EFFECTS[editStatus] && (
        <div
          data-guide="order-status-effect"
          style={{ marginTop: 8, padding: '8px 12px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, fontSize: 12, color: '#075985', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
        >
          {STATUS_EFFECTS[editStatus]}
        </div>
      )}

      {/* 圖標標記圖例 — #／$／其他連動的統一說明。 */}
      <details data-guide="order-status-legend" style={{ marginTop: 8, border: '1px solid #e5e7eb', borderRadius: 8 }}>
        <summary style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>ℹ️ 狀態標記說明</summary>
        <div style={{ padding: '8px 12px', borderTop: '1px solid #f0f0f0', fontSize: 12, color: '#6b7280', lineHeight: 1.9 }}>
          {STATUS_MARK_LEGEND}
        </div>
      </details>

      <label htmlFor="admin-order-note" style={labelStyle}>Admin Note</label>
      <textarea id="admin-order-note" value={editNote} onChange={e => setEditNote(e.target.value)} rows={3}
        style={{ ...inputStyle, resize: 'vertical' }} />

      <details data-guide="exception-panel" style={{ marginTop: 16, border: '1px solid #e5e7eb', borderRadius: 8 }}>
        <summary style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#374151' }}>🔧 例外處理</summary>
        <div style={{ padding: '10px 14px', borderTop: '1px solid #f0f0f0' }}>
          <label htmlFor="admin-order-exception-action" style={labelStyle}>Action</label>
          <Select id="admin-order-exception-action" value={exceptionAction} onChange={v => setExceptionAction(v as any)}>
            <option value="reschedule">reschedule（改期）</option>
            <option value="adjust_capacity">adjust_capacity（名額修正）</option>
            <option value="oversell_fix">oversell_fix（超賣修正）</option>
          </Select>
          <label htmlFor="admin-order-target-schedule-id" style={labelStyle}>targetScheduleId（可選）</label>
          <input id="admin-order-target-schedule-id" value={targetScheduleId} onChange={e => setTargetScheduleId(e.target.value)} style={inputStyle} placeholder="例如 sch_chaishan_0401" />
          <label htmlFor="admin-order-new-capacity" style={labelStyle}>newCapacity（adjust_capacity 時使用）</label>
          <input id="admin-order-new-capacity" value={newCapacity} onChange={e => setNewCapacity(e.target.value)} style={inputStyle} placeholder="例如 12" />
          <button onClick={applyException} disabled={exceptionBusy} style={{ ...btnStyle('secondary'), marginTop: 10 }}>
            {exceptionBusy ? '套用中…' : '套用例外處理'}
          </button>
        </div>
      </details>

      {/* #1411 — 留言串唯讀檢視（admin 第一期不發言） */}
      {orderMessages.length > 0 && (
        <details data-guide="order-messages" style={{ marginTop: 14, border: '1px solid #e5e7eb', borderRadius: 8 }}>
          <summary style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#374151' }}>
            💬 旅客 ↔ 嚮導留言（{orderMessages.length}）
          </summary>
          <ul style={{ margin: 0, padding: '8px 14px 12px', listStyle: 'none' }}>
            {orderMessages.map((m: any) => (
              <li key={m.id} data-guide="order-message-row" style={{ fontSize: 12, color: '#374151', padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
                <strong style={{ color: m.senderRole === 'guide' ? '#7c3aed' : '#0f766e' }}>
                  {m.senderRole === 'guide' ? '嚮導' : m.senderRole === 'traveler' ? '旅客' : '客服'}
                </strong>
                <span style={{ marginLeft: 6, color: '#9ca3af' }}>
                  {m.createdAt ? new Date(m.createdAt).toLocaleString('zh-TW') : '-'}
                </span>
                <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: 2 }}>{m.body}</div>
              </li>
            ))}
          </ul>
        </details>
      )}

      <button onClick={saveDetail} disabled={saving} style={{ ...btnStyle('primary'), marginTop: 14, width: '100%' }}>
        {saving ? '儲存中…' : '儲存變更'}
      </button>
      {saveError && <p data-guide="save-error" style={{ margin: '8px 0 0', fontSize: 12, color: '#dc2626' }}>{saveError}</p>}

      {/* 取消＋退款：一次性正規流程（取消→釋放名額→建立全額退款 entry）。
          僅對「進行中」狀態（pending_payment/paid/confirmed/rejected）顯示；
          避免維運用上方狀態下拉手動改成取消／退款中而造成孤兒訂單。 */}
      {CANCELLABLE_STATUSES.includes(detail.status) && !cancelRefundDone && (
        <div data-guide="cancel-refund-section" style={{ marginTop: 14, padding: '12px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#b91c1c', marginBottom: 6 }}>取消＋退款（一次完成）</div>
          <p style={{ margin: '0 0 8px', fontSize: 12, color: '#7f1d1d', lineHeight: 1.7 }}>
            正規退款入口：自動釋放名額、建立全額退款記錄（會出現在「退款管理」）並把訂單設為已退款。
            <br />請勿用上方狀態下拉手動改成「取消／退款中」——那只改狀態、不會釋放名額也不會建立退款記錄。
          </p>
          <button
            data-guide="cancel-refund-btn"
            onClick={() => cancelAndRefund(detail.id)}
            disabled={cancelRefundBusy}
            style={{ ...btnStyle('danger'), width: '100%', opacity: cancelRefundBusy ? 0.5 : 1, cursor: cancelRefundBusy ? 'not-allowed' : 'pointer' }}
          >
            {cancelRefundBusy ? '處理中…' : '取消並全額退款'}
          </button>
          {cancelRefundError && <p style={{ margin: '8px 0 0', fontSize: 12, color: '#dc2626' }}>{cancelRefundError}</p>}
        </div>
      )}

      {cancelRefundDone && (
        <div data-guide="cancel-refund-done" style={{ marginTop: 14, padding: '10px 14px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, fontSize: 13, color: '#15803d', fontWeight: 600 }}>
          已取消並完成退款 ✓
        </div>
      )}

      {/* Refund Timeline — AC1/AC2/AC5 */}
      {timeline.filter((e: any) => /refund/.test(e.type || '')).length > 0 && (
        <details data-guide="refund-timeline" open style={{ marginTop: 14, border: '1px solid #fde68a', borderRadius: 8, background: '#fffbeb' }}>
          <summary style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#92400e' }}>
            🔄 退款時間軸 ({timeline.filter((e: any) => /refund/.test(e.type || '')).length})
          </summary>
          <ul style={{ margin: 0, padding: '8px 14px 12px', listStyle: 'none' }}>
            {timeline
              .filter((e: any) => /refund/.test(e.type || ''))
              .map((e: any, idx: number) => (
                <li key={e.at + idx} style={{ fontSize: 12, color: '#6b7280', padding: '6px 0', borderBottom: '1px solid #fde68a' }}>
                  <strong style={{ color: '#374151' }}>{e.title}</strong>
                  <span style={{ marginLeft: 6, color: '#9ca3af' }}>
                    {e.at ? new Date(e.at).toLocaleString('zh-TW') : '-'}
                  </span>
                  {e.detail?.trade_no && (
                    <span style={{ marginLeft: 8, fontFamily: 'monospace', fontSize: 11, background: '#f3f4f6', padding: '1px 5px', borderRadius: 4 }}>
                      ECPay: {String(e.detail.trade_no)}
                    </span>
                  )}
                  {e.detail?.tradeNo && !e.detail?.trade_no && (
                    <span style={{ marginLeft: 8, fontFamily: 'monospace', fontSize: 11, background: '#f3f4f6', padding: '1px 5px', borderRadius: 4 }}>
                      ECPay: {String(e.detail.tradeNo)}
                    </span>
                  )}
                </li>
              ))}
          </ul>
        </details>
      )}

      {/* Payment Timeline — shows trade_no for all payment events */}
      {timeline.filter((e: any) => /payment/.test(e.type || '') && (e.detail?.trade_no || e.detail?.tradeNo)).length > 0 && (
        <details data-guide="payment-timeline" style={{ marginTop: 10, border: '1px solid #e5e7eb', borderRadius: 8 }}>
          <summary style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#374151' }}>
            💳 付款紀錄 trade_no
          </summary>
          <ul style={{ margin: 0, padding: '8px 14px 12px', listStyle: 'none' }}>
            {timeline
              .filter((e: any) => /payment/.test(e.type || '') && (e.detail?.trade_no || e.detail?.tradeNo))
              .map((e: any, idx: number) => (
                <li key={e.at + idx} style={{ fontSize: 12, color: '#6b7280', padding: '4px 0', borderBottom: '1px solid #f3f4f6' }}>
                  <strong style={{ color: '#374151' }}>{e.title}</strong>
                  <span style={{ marginLeft: 8, fontFamily: 'monospace', fontSize: 11, background: '#f3f4f6', padding: '1px 5px', borderRadius: 4 }}>
                    trade_no: {String(e.detail?.trade_no || e.detail?.tradeNo)}
                  </span>
                </li>
              ))}
          </ul>
        </details>
      )}

      {/* AC1/AC2/AC3 — 執行退款 button for refund_pending orders */}
      {detail.status === 'refund_pending' && !refundExecuted && (
        <div data-guide="refund-execute-section" style={{ marginTop: 14, padding: '12px 14px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#9a3412', marginBottom: 8 }}>退款執行</div>
          {/* 部分退款金額：留空＝全額退款；可填較小金額（≤ 訂單總額）做部分退款。
              ECPay 訂單會以此金額向 ECPay 送出退刷（DoAction TotalAmount）；現金訂單則記錄為實退金額。 */}
          <label style={{ display: 'block', fontSize: 12, color: '#9a3412', marginBottom: 4 }}>
            退款金額（NT$）
          </label>
          <input
            data-guide="refund-amount-input"
            type="number"
            min={1}
            max={Number(detail.totalTwd ?? 0) || undefined}
            step={1}
            value={refundAmount}
            onChange={e => setRefundAmount(e.target.value)}
            placeholder={`留空＝全額退款 NT$${Number(detail.totalTwd ?? 0).toLocaleString()}`}
            style={{ ...inputStyle, marginBottom: 4 }}
          />
          <p style={{ margin: '0 0 8px', fontSize: 11, color: '#b45309', lineHeight: 1.6 }}>
            留空為全額退款。填較小金額即為<strong>部分退款</strong>（ECPay 訂單會以此金額向 ECPay 送出退刷；授權未請款者僅能全額取消）。
          </p>
          {/* AC3: cash orders (no trade_no) require reason textarea */}
          {!detail.trade_no && (
            <textarea
              data-guide="refund-reason-input"
              value={refundReason}
              onChange={e => setRefundReason(e.target.value)}
              placeholder="退款原因（現金訂單必填）"
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', marginBottom: 8 }}
            />
          )}
          <button
            data-guide="refund-execute-btn"
            onClick={() => executeRefund(detail.id)}
            disabled={isExecutingRefund || (!detail.trade_no && !refundReason.trim())}
            style={{ ...btnStyle('danger'), width: '100%', opacity: (isExecutingRefund || (!detail.trade_no && !refundReason.trim())) ? 0.5 : 1, cursor: (isExecutingRefund || (!detail.trade_no && !refundReason.trim())) ? 'not-allowed' : 'pointer' }}
          >
            {isExecutingRefund ? '退款執行中…' : '執行退款'}
          </button>
          {refundError && <p style={{ margin: '8px 0 0', fontSize: 12, color: '#dc2626' }}>{refundError}</p>}
        </div>
      )}

      {/* AC2: success message after execution */}
      {refundExecuted && (
        <div data-guide="refund-executed-msg" style={{ marginTop: 14, padding: '10px 14px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, fontSize: 13, color: '#15803d', fontWeight: 600 }}>
          退款已執行
        </div>
      )}

      {/* AC4: already-refunded state */}
      {detail.status === 'refunded' && (
        <div data-guide="refund-completed-banner" style={{ marginTop: 14, padding: '10px 14px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, fontSize: 13, color: '#15803d', fontWeight: 600 }}>
          已完成退款 ✓
        </div>
      )}

      {auditLogs.length > 0 && (
        <details data-guide="audit-logs" style={{ marginTop: 14, border: '1px solid #e5e7eb', borderRadius: 8 }}>
          <summary style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>📋 Audit Logs ({auditLogs.length})</summary>
          <ul style={{ margin: 0, padding: '8px 14px 12px', listStyle: 'none' }}>
            {auditLogs.map((l: any) => (
              <li key={l.id} style={{ fontSize: 12, color: '#6b7280', padding: '4px 0', borderBottom: '1px solid #f3f4f6' }}>
                <strong style={{ color: '#374151' }}>{l.action}</strong> · {l.createdAt ? new Date(l.createdAt).toLocaleString('zh-TW') : '-'}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );

  return (
    <div style={{ background: '#f9fafb', minHeight: '100vh' }}>
      <PageHeader title="訂單管理" subtitle="查看、篩選、修改訂單狀態與備註" />

      <div className="admin-page" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Filter */}
        <Card className="admin-toolbar" style={{ padding: '14px 18px' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>篩選狀態</span>
          <Select data-guide="order-filter" value={status} onChange={setStatus} style={{ minWidth: 160 }}>
            <option value="">全部狀態</option>
            {ORDER_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>)}
          </Select>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>來源</span>
          <Select data-testid="admin-order-source-filter" value={sourceChannel} onChange={setSourceChannel} style={{ minWidth: 140 }}>
            <option value="">全部來源</option>
            {SOURCE_CHANNELS.map(s => <option key={s} value={s}>{SOURCE_LABELS[s] ?? s}</option>)}
          </Select>
          <span className="admin-toolbar-meta" style={{ fontSize: 13, color: '#9ca3af' }}>共 {filtered.length} 筆</span>
        </Card>

        {/* 讀取失敗：明確告知並提供重試，避免被誤讀為「沒有訂單」 */}
        {!loading && loadError && (
          <Card
            data-testid="admin-orders-load-error"
            style={{ padding: '14px 18px', border: '1px solid #fecaca', background: '#fef2f2' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ color: '#b91c1c', fontSize: 14, fontWeight: 600 }}>{loadError}</div>
              <button
                onClick={() => { void load(); }}
                style={{ padding: '6px 16px', borderRadius: 8, border: 'none', background: '#b91c1c', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                重試
              </button>
            </div>
          </Card>
        )}

        <div className="admin-split-grid">
          {/* Table */}
          <Card data-guide="order-table">
            <ResponsiveTable
              columns={orderColumns}
              rows={filtered}
              getRowKey={(r) => r.id}
              onRowClick={(r) => setSelectedId(r.id)}
              selectedKey={selectedId}
              loading={loading}
              loadingRows={8}
              emptyMessage={loadError ? '載入失敗，訂單資料暫時無法顯示，請點上方「重試」' : '沒有訂單資料'}
            />
          </Card>

          {/* Detail Panel — 桌機在右側並排顯示；手機改用彈出視窗（見下方 ResponsiveModal），
              避免點選訂單後必須滑到頁面最下方才看得到詳情。 */}
          {!isMobile && (
          <Card data-guide="order-detail" style={{ padding: 20 }}>
            {!detail ? (
              <div style={{ padding: '32px 0', textAlign: 'center', color: '#9ca3af' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>👆</div>
                <p style={{ margin: 0, fontSize: 14 }}>點選左側訂單查看詳情</p>
              </div>
            ) : (
              detailBody
            )}
          </Card>
          )}
        </div>
      </div>

      {/* 手機版訂單詳情彈出視窗：點擊清單訂單即跳出，無需捲到頁尾 */}
      <ResponsiveModal
        open={isMobile && !!detail}
        onClose={() => setSelectedId('')}
        title={detail ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>訂單詳情 <StatusBadge status={detail.status} /></span> : '訂單詳情'}
        size="lg"
        data-testid="admin-order-detail-modal"
      >
        {detailBody}
      </ResponsiveModal>
    </div>
  );
}
