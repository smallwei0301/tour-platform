'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

export interface PlanDetail {
  id: string;
  label: string;
  duration?: string;
  price?: number;
  priceMultiplier?: number;
  priceType?: 'per_person' | 'per_group';
  basePrice?: number;
  language?: string;
  earliestDeparture?: string;
  confirmByDays?: number;
  freeCancelDays?: number;
  planInclusions?: string[];
  planExclusions?: string[];
  planItinerary?: Array<{ icon?: string; title?: string; duration?: string; description?: string; imageUrl?: string; text?: string }>;
  meetingPointName?: string;
  meetingAddress?: string;
  experiencePointName?: string;
  experienceAddress?: string;
  planNotices?: string[];
  planRefundRules?: string[];
}

interface PlanDetailModalProps {
  plan: PlanDetail;
  basePrice: number;
  onClose: () => void;
}

/* Midao brand palette (BRAND_BOOK.md Section 03) — 山墨/古紙/朝霞/苔綠/黃銅/雲霧 */
const C = {
  panel: 'linear-gradient(180deg, #1f2a1f 0%, #18221a 100%)',
  border: 'rgba(190, 178, 137, 0.3)',
  text: '#efe9d3',
  gold: '#ded7ab',
  muted: 'rgba(237, 228, 203, 0.62)',
  brass: '#b08d3e',
  accent: '#c2542e',
  moss: '#7c9e6a',
  cardBg: 'rgba(86, 116, 76, 0.16)',
};

/* 純線條 SVG 圖示（stroke currentColor），取代突兀的彩色 emoji */
const ICONS = {
  globe: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
  ),
  clock: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  ),
  calendar: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  ),
  check: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
    </svg>
  ),
  refresh: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
    </svg>
  ),
};

// #297 行程介紹（plan itinerary）已從方案詳情 Modal 移除，改於行程頁「詳細行程」區段
// 依所選方案呈現；此處不再提供「行程介紹」分頁。
const TABS = [
  { id: 'highlights',  labelKey: 'tabHighlights' },
  { id: 'cost',        labelKey: 'tabCost' },
  { id: 'meeting',     labelKey: 'tabMeeting' },
  { id: 'experience',  labelKey: 'tabExperience' },
  { id: 'notices',     labelKey: 'tabNotices' },
  { id: 'refund',      labelKey: 'tabRefund' },
];

export function PlanDetailModal({ plan, basePrice, onClose }: PlanDetailModalProps) {
  const t = useTranslations('planModal');
  const [activeTab, setActiveTab] = useState('highlights');
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const trigger = document.activeElement;

    // Focus the modal panel so it can receive keyboard events immediately
    modalRef.current?.focus();

    const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab') {
        const modal = modalRef.current;
        if (!modal) return;
        const focusable = Array.from(modal.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
          (el) => !el.hasAttribute('disabled') && el.tabIndex !== -1
        );
        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          // Shift+Tab: if focus is on first focusable (or the modal div itself), wrap to last
          if (document.activeElement === first || document.activeElement === modal) {
            e.preventDefault();
            last.focus();
          }
        } else {
          // Tab: if focus is on last focusable (or the modal div itself), wrap to first
          if (document.activeElement === last || document.activeElement === modal) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      (trigger as HTMLElement)?.focus();
    };
  }, [onClose]);

  const planPrice =
    (Number.isFinite(Number(plan.basePrice)) && Number(plan.basePrice) > 0
      ? Number(plan.basePrice)
      : null) ??
    plan.price ??
    Math.round(basePrice * (plan.priceMultiplier ?? 1));

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed', inset: 0, background: 'rgba(10, 16, 11, 0.62)',
          zIndex: 1000, backdropFilter: 'blur(2px)',
        }}
        onClick={onClose}
      />

      {/* Modal panel */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-modal-title"
        tabIndex={-1}
        style={{
          position: 'fixed', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          background: C.panel, color: C.text, borderRadius: 16,
          border: `1px solid ${C.border}`,
          zIndex: 1001, width: '90vw', maxWidth: 560, maxHeight: '85dvh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 70px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px 12px', borderBottom: `1px solid ${C.border}`, flexShrink: 0,
        }}>
          <h2 id="plan-modal-title" style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.gold }}>{t('title')}</h2>
          <button onClick={onClose} aria-label={t('close')} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 22, color: C.muted, padding: '4px 8px', lineHeight: 1,
          }}>×</button>
        </div>

        {/* Tab nav */}
        <div
          role="tablist"
          aria-label={t('tablistLabel')}
          style={{
            display: 'flex', gap: 0, overflowX: 'auto', flexShrink: 0,
            borderBottom: `1px solid ${C.border}`, padding: '0 20px',
            scrollbarWidth: 'none',
          }}
        >
          {TABS.map((tab, idx) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`plan-tab-panel-${tab.id}`}
              id={`plan-tab-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(e) => {
                let nextIdx = idx;
                if (e.key === 'ArrowRight') nextIdx = (idx + 1) % TABS.length;
                else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + TABS.length) % TABS.length;
                else return;
                e.preventDefault();
                setActiveTab(TABS[nextIdx].id);
                (e.currentTarget.parentElement?.children[nextIdx] as HTMLElement)?.focus();
              }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '10px 14px', fontSize: 13, fontWeight: activeTab === tab.id ? 700 : 500, whiteSpace: 'nowrap',
                color: activeTab === tab.id ? C.gold : C.muted,
                borderBottom: activeTab === tab.id ? `2px solid ${C.brass}` : '2px solid transparent',
                transition: 'all 0.15s',
              }}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div
          role="tabpanel"
          id={`plan-tab-panel-${activeTab}`}
          aria-labelledby={`plan-tab-${activeTab}`}
          style={{ overflowY: 'auto', flex: 1, padding: '20px' }}
        >

          {/* ── 方案亮點 ── */}
          {activeTab === 'highlights' && (
            <div>
              <p style={{ fontSize: 22, fontWeight: 800, color: C.gold, marginBottom: 20, marginTop: 0 }}>
                NT$ {planPrice.toLocaleString()}
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {plan.language && (
                  <div style={infoRowStyle}>
                    <span style={iconStyle}>{ICONS.globe}</span>
                    <span>{plan.language}</span>
                  </div>
                )}
                {plan.duration && (
                  <div style={infoRowStyle}>
                    <span style={iconStyle}>{ICONS.clock}</span>
                    <span>{t('tripDuration', { duration: plan.duration })}</span>
                  </div>
                )}
                {plan.earliestDeparture && (
                  <div style={infoRowStyle}>
                    <span style={iconStyle}>{ICONS.calendar}</span>
                    <span>{t('earliestDeparture', { date: plan.earliestDeparture })}</span>
                  </div>
                )}
                {plan.confirmByDays != null && (
                  <div style={infoRowStyle}>
                    <span style={iconStyle}>{ICONS.check}</span>
                    <span>{t('confirmByDays', { n: plan.confirmByDays })}</span>
                  </div>
                )}
                {plan.freeCancelDays != null && (
                  <div style={infoRowStyle}>
                    <span style={iconStyle}>{ICONS.refresh}</span>
                    <span>{t('freeCancelDays', { n: plan.freeCancelDays })}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── 費用資訊 ── */}
          {activeTab === 'cost' && (
            <div>
              <h3 style={sectionHeadStyle}>{t('costHeading')}</h3>
              {plan.planInclusions && plan.planInclusions.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <p style={subHeadStyle}>{t('inclusionsHeading')}</p>
                  <ul style={listStyle}>
                    {plan.planInclusions.map((item, i) => (
                      <li key={i} style={listItemStyle}>
                        <span style={{ ...checkStyle, background: 'rgba(124, 158, 106, 0.2)', color: C.moss, border: `1px solid ${C.moss}` }}>✓</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {plan.planExclusions && plan.planExclusions.length > 0 && (
                <div>
                  <p style={subHeadStyle}>{t('exclusionsHeading')}</p>
                  <ul style={listStyle}>
                    {plan.planExclusions.map((item, i) => (
                      <li key={i} style={listItemStyle}>
                        <span style={{ ...checkStyle, background: 'rgba(194, 84, 46, 0.2)', color: C.accent, border: `1px solid ${C.accent}` }}>✕</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(!plan.planInclusions?.length && !plan.planExclusions?.length) && (
                <p style={emptyStyle}>{t('costEmpty')}</p>
              )}
            </div>
          )}

          {/* ── 集合地點 ── */}
          {activeTab === 'meeting' && (
            <div>
              <h3 style={sectionHeadStyle}>{t('meetingHeading')}</h3>
              {plan.meetingPointName || plan.meetingAddress ? (
                <div style={locationCardStyle}>
                  {plan.meetingPointName && (
                    <p style={{ fontWeight: 600, marginBottom: 4, color: C.text }}>{t('locationName', { name: plan.meetingPointName })}</p>
                  )}
                  {plan.meetingAddress && (
                    <p style={{ fontSize: 14, color: C.muted, margin: 0 }}>{t('locationAddress', { address: plan.meetingAddress })}</p>
                  )}
                </div>
              ) : (
                <p style={emptyStyle}>{t('meetingEmpty')}</p>
              )}
            </div>
          )}

          {/* ── 體驗地點 ── */}
          {activeTab === 'experience' && (
            <div>
              <h3 style={sectionHeadStyle}>{t('experienceHeading')}</h3>
              {plan.experiencePointName || plan.experienceAddress ? (
                <div style={locationCardStyle}>
                  {plan.experiencePointName && (
                    <p style={{ fontWeight: 600, marginBottom: 4, color: C.text }}>{t('locationName', { name: plan.experiencePointName })}</p>
                  )}
                  {plan.experienceAddress && (
                    <p style={{ fontSize: 14, color: C.muted, margin: 0 }}>{t('locationAddress', { address: plan.experienceAddress })}</p>
                  )}
                </div>
              ) : (
                <p style={emptyStyle}>{t('experienceEmpty')}</p>
              )}
            </div>
          )}

          {/* ── 購買須知 ── */}
          {activeTab === 'notices' && (
            <div>
              <h3 style={sectionHeadStyle}>{t('noticesHeading')}</h3>
              {plan.planNotices && plan.planNotices.length > 0 ? (
                <ul style={listStyle}>
                  {plan.planNotices.map((n, i) => (
                    <li key={i} style={{ ...listItemStyle, paddingLeft: 0, listStyle: 'disc', marginLeft: 18, display: 'list-item' }}>{n}</li>
                  ))}
                </ul>
              ) : (
                <p style={emptyStyle}>{t('noticesEmpty')}</p>
              )}
            </div>
          )}

          {/* ── 取消政策 ── */}
          {activeTab === 'refund' && (
            <div>
              <h3 style={sectionHeadStyle}>{t('refundHeading')}</h3>
              <p style={subHeadStyle}>{t('refundFeeSubHead')}</p>
              <p style={{ fontSize: 14, marginBottom: 16, color: C.text }}>{t('refundFeeValue')}</p>
              <p style={subHeadStyle}>{t('refundPolicySubHead')}</p>
              {plan.planRefundRules && plan.planRefundRules.length > 0 ? (
                <ul style={listStyle}>
                  {plan.planRefundRules.map((r, i) => (
                    <li key={i} style={{ ...listItemStyle, paddingLeft: 0, listStyle: 'disc', marginLeft: 18, display: 'list-item' }}>{r}</li>
                  ))}
                </ul>
              ) : (
                <p style={emptyStyle}>{t('refundEmpty')}</p>
              )}
            </div>
          )}

        </div>
      </div>
    </>
  );
}

/* ── Styles ── */
const infoRowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14, lineHeight: 1.5, color: C.text,
};
const iconStyle: React.CSSProperties = {
  width: 22, flexShrink: 0, display: 'inline-flex', justifyContent: 'center',
  color: C.brass, marginTop: 1,
};
const sectionHeadStyle: React.CSSProperties = {
  fontSize: 16, fontWeight: 700, margin: '0 0 14px', color: C.gold,
};
const subHeadStyle: React.CSSProperties = {
  fontSize: 14, fontWeight: 600, margin: '0 0 8px', color: C.text,
};
const listStyle: React.CSSProperties = {
  listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8, color: C.text,
};
const listItemStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 14, lineHeight: 1.5, color: C.text,
};
const checkStyle: React.CSSProperties = {
  width: 18, height: 18, borderRadius: '50%', display: 'inline-flex',
  alignItems: 'center', justifyContent: 'center', fontSize: 10,
  fontWeight: 700, flexShrink: 0, marginTop: 1,
};
const locationCardStyle: React.CSSProperties = {
  background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 10,
  padding: '14px 16px', fontSize: 14, color: C.text,
};
const emptyStyle: React.CSSProperties = {
  color: C.muted, fontSize: 14,
};
