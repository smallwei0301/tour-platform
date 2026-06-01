'use client';
import { useState, useEffect } from 'react';

// ── Types ──────────────────────────────────────────────
export type GuideStep = {
  selector: string;        // CSS selector 指向目標元素
  title: string;
  content: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
};

type Rect = { top: number; left: number; width: number; height: number };

// ── Per-page guide definitions ─────────────────────────
export const PAGE_GUIDES: Record<string, { label: string; steps: GuideStep[] }> = {
  '/admin': {
    label: 'Dashboard 使用指南',
    steps: [
      {
        selector: '[data-guide="kpi-cards"]',
        title: '📊 KPI 數值卡片',
        content: '顯示訂單總數、待處理訂單、退款申請、GMV 等即時指標。數值依右上方時間篩選器動態更新。',
        placement: 'bottom',
      },
      {
        selector: '[data-guide="time-filter"]',
        title: '🗓️ 時間範圍篩選',
        content: '點選「今天」、「近 7 日」、「近 30 日」或「自訂」來切換統計區間，所有 KPI 卡片即時重算。',
        placement: 'bottom',
      },
      {
        selector: '[data-guide="kpi-explanation"]',
        title: '📋 KPI 口徑說明',
        content: '展開後可查看每個指標的計算公式，例如 totalGmv、commissionRate、healthyOrderRate 的定義。',
        placement: 'top',
      },
      {
        selector: '[data-guide="trend-chart"]',
        title: '📈 趨勢圖',
        content: '呈現選定區間內的訂單、退款、導遊申請每日趨勢。可快速判斷業務健康度。',
        placement: 'top',
      },
      {
        selector: '[data-guide="pending-orders"]',
        title: '⏳ 待處理訂單',
        content: '快速列出需要關注的訂單（pending_payment、paid 等狀態）。點「查看全部」進入訂單管理頁。',
        placement: 'top',
      },
    ],
  },
  '/admin/orders': {
    label: '訂單管理使用指南',
    steps: [
      {
        selector: '[data-guide="order-filter"]',
        title: '🔍 狀態篩選',
        content: '從下拉選單選擇訂單狀態（待付款、已付款、已確認…），清單立即更新。',
        placement: 'bottom',
      },
      {
        selector: '[data-guide="order-table"]',
        title: '📋 訂單列表',
        content: '點任意一列即可在右側展開訂單詳情。綠色毛利為健康，紅色表示有虧損或補貼。',
        placement: 'right',
      },
      {
        selector: '[data-guide="order-detail"]',
        title: '🗂️ 訂單詳情面板',
        content: '在此修改訂單狀態、填寫 Admin Note，完成後點「儲存變更」送出。',
        placement: 'left',
      },
      {
        selector: '[data-guide="exception-panel"]',
        title: '🔧 例外處理',
        content: '展開後可對訂單執行改期（reschedule）、名額修正（adjust_capacity）或超賣修正（oversell_fix）。',
        placement: 'left',
      },
      {
        selector: '[data-guide="audit-logs"]',
        title: '📜 Audit Logs',
        content: '展開後可查看此訂單所有歷史操作紀錄，包含誰在何時做了哪些變更。',
        placement: 'left',
      },
    ],
  },
  '/admin/refunds': {
    label: '退款管理使用指南',
    steps: [
      {
        selector: '[data-guide="refund-list"]',
        title: '↩️ 退款申請列表',
        content: '顯示所有退款申請，每筆顯示關聯訂單、申請原因、申請金額。',
        placement: 'bottom',
      },
      {
        selector: '[data-guide="refund-approve"]',
        title: '✅ 通過退款',
        content: '點「通過」按鈕將退款狀態更新為 approved，系統會記錄操作者與時間。',
        placement: 'left',
      },
      {
        selector: '[data-guide="refund-reject"]',
        title: '❌ 拒絕退款',
        content: '點「拒絕」按鈕標記為 rejected。建議在 Admin Note 說明拒絕原因供日後稽查。',
        placement: 'left',
      },
    ],
  },
  '/admin/guides': {
    label: '導遊審核使用指南',
    steps: [
      {
        selector: '[data-guide="guide-filter"]',
        title: '🔍 狀態篩選',
        content: '選擇「待審核」快速過濾需要人工審核的申請。支援全部、已通過、已拒絕、已停權。',
        placement: 'bottom',
      },
      {
        selector: '[data-guide="guide-cards"]',
        title: '🧭 導遊申請卡片',
        content: '每張卡片顯示導遊姓名、地區、自我介紹、聯絡方式及申請日期。',
        placement: 'bottom',
      },
      {
        selector: '[data-guide="guide-approve"]',
        title: '✓ 通過申請',
        content: '點「通過」後導遊狀態更新為 approved，可開始在平台接案。',
        placement: 'top',
      },
      {
        selector: '[data-guide="guide-reject"]',
        title: '✕ 拒絕申請',
        content: '點「拒絕」將申請標記為 rejected。可搭配 Admin Note 填寫原因。',
        placement: 'top',
      },
    ],
  },
  '/admin/operations-tracking': {
    label: '操作追蹤使用指南',
    steps: [
      {
        selector: '[data-guide="ops-kpi"]',
        title: '💰 KPI 摘要',
        content: '顯示總 GMV、平台總收入、平均每單貢獻及健康訂單率。',
        placement: 'bottom',
      },
      {
        selector: '[data-guide="ops-table"]',
        title: '📊 訂單追蹤表格',
        content: '列出每筆訂單的 GMV、抽成、最終貢獻與健康狀態（✅ 健康 / ⚠️ 異常）。',
        placement: 'right',
      },
      {
        selector: '[data-guide="ops-edit"]',
        title: '✏️ 編輯營運欄位',
        content: '點選任一訂單列開啟右側編輯面板，可填寫人工時間、成本、退款金額，勾選客訴/改期等旗標。',
        placement: 'left',
      },
      {
        selector: '[data-guide="ops-csv"]',
        title: '⬇️ 匯出 CSV',
        content: '點「匯出 CSV」下載所有追蹤數據，可匯入 Excel 進行進一步分析。',
        placement: 'bottom',
      },
    ],
  },
  '/admin/settings/kpi': {
    label: 'KPI 設定使用指南',
    steps: [
      {
        selector: '[data-guide="kpi-form"]',
        title: '⚙️ KPI 參數設定',
        content: '調整 commissionRate（抽成率）、paymentFeeRate（金流費率）等核心參數。修改後點「儲存設定」生效。',
        placement: 'bottom',
      },
      {
        selector: '[data-guide="kpi-history"]',
        title: '📜 版本歷史',
        content: '每次儲存都會建立新版本。點「回滾」可還原至任意舊版本，並自動記入 Audit Log。',
        placement: 'top',
      },
    ],
  },
  '/admin/settings/security': {
    label: '安全設定使用指南',
    steps: [
      {
        selector: '[data-guide="security-version"]',
        title: '🔢 Session Version',
        content: '顯示目前 Session 版本號。旋轉 Token 後版本號遞增，所有舊 Session 自動失效。',
        placement: 'bottom',
      },
      {
        selector: '[data-guide="security-rotate"]',
        title: '🔄 旋轉 Token',
        content: '輸入舊 Token 與新 Token 後點「旋轉 Token」。所有已登入的 Admin Session 將立即失效。',
        placement: 'bottom',
      },
      {
        selector: '[data-guide="security-force-logout"]',
        title: '🚪 強制登出',
        content: '立即登出所有 Admin Session（不需輸入新 Token）。適合緊急情況下快速踢出所有人。',
        placement: 'top',
      },
    ],
  },
};

// ── Helper: get element rect ───────────────────────────
function getRect(selector: string): Rect | null {
  try {
    const el = document.querySelector(selector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top + window.scrollY, left: r.left + window.scrollX, width: r.width, height: r.height };
  } catch { return null; }
}

// ── Main Component ─────────────────────────────────────
export function AdminGuide({ pathname }: { pathname: string }) {
  const guide = PAGE_GUIDES[pathname];
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    if (!open || !guide) return;
    const current = guide.steps[step];
    if (!current) return;

    const update = () => {
      setRect(getRect(current.selector));
    };

    // Try scrolling element into view
    const el = document.querySelector(current.selector);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });

    update();
    const id = setInterval(update, 200);
    return () => clearInterval(id);
  }, [open, step, guide]);

  if (!guide) return null;

  const PADDING = 12;
  const tooltipW = 280;
  const stepData = guide.steps[step];

  const tooltipStyle = (): React.CSSProperties => {
    if (!rect) return { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    const pl = stepData?.placement ?? 'bottom';
    const base: React.CSSProperties = { position: 'absolute', width: tooltipW, zIndex: 10002 };
    if (pl === 'bottom') return { ...base, top: rect.top + rect.height + PADDING, left: Math.max(8, rect.left + rect.width / 2 - tooltipW / 2) };
    if (pl === 'top') return { ...base, top: rect.top - PADDING - 160, left: Math.max(8, rect.left + rect.width / 2 - tooltipW / 2) };
    if (pl === 'right') return { ...base, top: rect.top, left: rect.left + rect.width + PADDING };
    if (pl === 'left') return { ...base, top: rect.top, left: Math.max(8, rect.left - tooltipW - PADDING) };
    return base;
  };

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => { setOpen(true); setStep(0); }}
        title={guide.label}
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          width: 44, height: 44, borderRadius: '50%',
          background: 'var(--tp-primary)', color: '#fff',
          border: 'none', cursor: 'pointer', fontSize: 20,
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        ?
      </button>

      {open && guide && (
        <>
          {/* Overlay backdrop */}
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 10000, cursor: 'pointer' }}
          />

          {/* Spotlight cutout */}
          {rect && (
            <div style={{
              position: 'absolute',
              top: rect.top - PADDING,
              left: rect.left - PADDING,
              width: rect.width + PADDING * 2,
              height: rect.height + PADDING * 2,
              borderRadius: 8,
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
              zIndex: 10001,
              border: '2px solid var(--tp-primary)',
              pointerEvents: 'none',
            }} />
          )}

          {/* Tooltip */}
          <div style={{
            ...tooltipStyle(),
            background: '#fff', borderRadius: 12, padding: '16px 18px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            zIndex: 10002,
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--tp-primary)' }}>
                {stepData?.title}
              </span>
              <button aria-label="關閉" onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 16, lineHeight: 1 }}>✕</button>
            </div>

            {/* Content */}
            <p style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.6, color: '#374151' }}>
              {stepData?.content}
            </p>

            {/* Progress dots */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              {guide.steps.map((_, i) => (
                <div key={i} onClick={() => setStep(i)} style={{
                  width: 8, height: 8, borderRadius: '50%', cursor: 'pointer',
                  background: i === step ? 'var(--tp-primary)' : '#e5e7eb',
                  transition: 'background .2s',
                }} />
              ))}
            </div>

            {/* Navigation */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#9ca3af' }}>{step + 1} / {guide.steps.length}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                {step > 0 && (
                  <button onClick={() => setStep(s => s - 1)} style={{
                    padding: '6px 14px', borderRadius: 6, border: '1px solid #e5e7eb',
                    background: '#f9fafb', cursor: 'pointer', fontSize: 13,
                  }}>上一步</button>
                )}
                {step < guide.steps.length - 1 ? (
                  <button onClick={() => setStep(s => s + 1)} style={{
                    padding: '6px 14px', borderRadius: 6, border: 'none',
                    background: 'var(--tp-primary)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  }}>下一步</button>
                ) : (
                  <button onClick={() => setOpen(false)} style={{
                    padding: '6px 14px', borderRadius: 6, border: 'none',
                    background: 'var(--tp-accent)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  }}>完成 🎉</button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
