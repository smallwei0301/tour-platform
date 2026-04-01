'use client';

import { useState } from 'react';

export interface PlanDetail {
  id: string;
  label: string;
  duration?: string;
  price?: number;
  priceMultiplier?: number;
  language?: string;
  earliestDeparture?: string;
  confirmByDays?: number;
  freeCancelDays?: number;
  planInclusions?: string[];
  planExclusions?: string[];
  planItinerary?: Array<{ text: string; imageUrl?: string }>;
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

const TABS = [
  { id: 'highlights',  label: '方案亮點' },
  { id: 'cost',        label: '費用資訊' },
  { id: 'itinerary',   label: '行程介紹' },
  { id: 'meeting',     label: '集合地點' },
  { id: 'experience',  label: '體驗地點' },
  { id: 'notices',     label: '購買須知' },
  { id: 'refund',      label: '取消政策' },
];

export function PlanDetailModal({ plan, basePrice, onClose }: PlanDetailModalProps) {
  const [activeTab, setActiveTab] = useState('highlights');
  const planPrice = plan.price ?? Math.round(basePrice * (plan.priceMultiplier ?? 1));

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          zIndex: 1000, backdropFilter: 'blur(2px)',
        }}
        onClick={onClose}
      />

      {/* Modal panel */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        background: '#fff', borderRadius: 16,
        zIndex: 1001, width: '90vw', maxWidth: 560, maxHeight: '85dvh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px 0', borderBottom: '1px solid #e5e7eb', flexShrink: 0,
        }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>方案詳情</h2>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 22, color: '#6b7280', padding: '4px 8px', lineHeight: 1,
          }}>×</button>
        </div>

        {/* Tab nav */}
        <div style={{
          display: 'flex', gap: 0, overflowX: 'auto', flexShrink: 0,
          borderBottom: '1px solid #e5e7eb', padding: '0 20px',
          scrollbarWidth: 'none',
        }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '10px 14px', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap',
                color: activeTab === tab.id ? '#16a34a' : '#6b7280',
                borderBottom: activeTab === tab.id ? '2px solid #16a34a' : '2px solid transparent',
                transition: 'all 0.15s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '20px' }}>

          {/* ── 方案亮點 ── */}
          {activeTab === 'highlights' && (
            <div>
              <p style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 20 }}>
                NT$ {planPrice.toLocaleString()}
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {plan.language && (
                  <div style={infoRowStyle}>
                    <span style={iconStyle}>🌐</span>
                    <span>{plan.language}</span>
                  </div>
                )}
                {plan.duration && (
                  <div style={infoRowStyle}>
                    <span style={iconStyle}>🕐</span>
                    <span>行程時間：{plan.duration}</span>
                  </div>
                )}
                {plan.earliestDeparture && (
                  <div style={infoRowStyle}>
                    <span style={iconStyle}>📅</span>
                    <span>最早可出發日：{plan.earliestDeparture}</span>
                  </div>
                )}
                {plan.confirmByDays != null && (
                  <div style={infoRowStyle}>
                    <span style={iconStyle}>✅</span>
                    <span>最晚於出發前 {plan.confirmByDays} 天回覆訂購結果</span>
                  </div>
                )}
                {plan.freeCancelDays != null && (
                  <div style={infoRowStyle}>
                    <span style={iconStyle}>🔄</span>
                    <span>{plan.freeCancelDays} 天前可免費取消</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── 費用資訊 ── */}
          {activeTab === 'cost' && (
            <div>
              <h3 style={sectionHeadStyle}>費用包含／不包含</h3>
              {plan.planInclusions && plan.planInclusions.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <p style={subHeadStyle}>費用包含</p>
                  <ul style={listStyle}>
                    {plan.planInclusions.map((item, i) => (
                      <li key={i} style={listItemStyle}>
                        <span style={{ ...checkStyle, background: '#dcfce7', color: '#16a34a' }}>✓</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {plan.planExclusions && plan.planExclusions.length > 0 && (
                <div>
                  <p style={subHeadStyle}>費用不包含</p>
                  <ul style={listStyle}>
                    {plan.planExclusions.map((item, i) => (
                      <li key={i} style={listItemStyle}>
                        <span style={{ ...checkStyle, background: '#fee2e2', color: '#dc2626' }}>✕</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(!plan.planInclusions?.length && !plan.planExclusions?.length) && (
                <p style={{ color: '#9ca3af', fontSize: 14 }}>請在後台填寫費用包含／不包含資訊</p>
              )}
            </div>
          )}

          {/* ── 行程介紹 ── */}
          {activeTab === 'itinerary' && (
            <div>
              {plan.duration && (
                <p style={{ fontSize: 14, color: '#374151', marginBottom: 16 }}>行程時間：{plan.duration}</p>
              )}
              {plan.planItinerary && plan.planItinerary.length > 0 ? (
                <ul style={{ listStyle: 'disc', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {plan.planItinerary.map((item, i) => (
                    <li key={i} style={{ fontSize: 14, lineHeight: 1.6, color: '#374151' }}>
                      {item.text}
                      {item.imageUrl && (
                        <img
                          src={item.imageUrl}
                          alt=""
                          style={{ display: 'block', marginTop: 10, width: '100%', maxWidth: 360, borderRadius: 8, objectFit: 'cover' }}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ color: '#9ca3af', fontSize: 14 }}>請在後台填寫行程介紹</p>
              )}
            </div>
          )}

          {/* ── 集合地點 ── */}
          {activeTab === 'meeting' && (
            <div>
              <h3 style={sectionHeadStyle}>集合地點</h3>
              {plan.meetingPointName || plan.meetingAddress ? (
                <div style={locationCardStyle}>
                  {plan.meetingPointName && (
                    <p style={{ fontWeight: 600, marginBottom: 4 }}>地點名稱：{plan.meetingPointName}</p>
                  )}
                  {plan.meetingAddress && (
                    <p style={{ fontSize: 14, color: '#6b7280' }}>地址：{plan.meetingAddress}</p>
                  )}
                </div>
              ) : (
                <p style={{ color: '#9ca3af', fontSize: 14 }}>請在後台填寫集合地點資訊</p>
              )}
            </div>
          )}

          {/* ── 體驗地點 ── */}
          {activeTab === 'experience' && (
            <div>
              <h3 style={sectionHeadStyle}>體驗地點</h3>
              {plan.experiencePointName || plan.experienceAddress ? (
                <div style={locationCardStyle}>
                  {plan.experiencePointName && (
                    <p style={{ fontWeight: 600, marginBottom: 4 }}>地點名稱：{plan.experiencePointName}</p>
                  )}
                  {plan.experienceAddress && (
                    <p style={{ fontSize: 14, color: '#6b7280' }}>地址：{plan.experienceAddress}</p>
                  )}
                </div>
              ) : (
                <p style={{ color: '#9ca3af', fontSize: 14 }}>請在後台填寫體驗地點資訊</p>
              )}
            </div>
          )}

          {/* ── 購買須知 ── */}
          {activeTab === 'notices' && (
            <div>
              <h3 style={sectionHeadStyle}>購買須知</h3>
              {plan.planNotices && plan.planNotices.length > 0 ? (
                <ul style={listStyle}>
                  {plan.planNotices.map((n, i) => (
                    <li key={i} style={{ ...listItemStyle, paddingLeft: 0, listStyle: 'disc', marginLeft: 18 }}>{n}</li>
                  ))}
                </ul>
              ) : (
                <p style={{ color: '#9ca3af', fontSize: 14 }}>請在後台填寫購買須知</p>
              )}
            </div>
          )}

          {/* ── 取消政策 ── */}
          {activeTab === 'refund' && (
            <div>
              <h3 style={sectionHeadStyle}>取消政策</h3>
              <p style={subHeadStyle}>手續費收取方式</p>
              <p style={{ fontSize: 14, marginBottom: 16 }}>指定手續費</p>
              <p style={subHeadStyle}>政策內容</p>
              {plan.planRefundRules && plan.planRefundRules.length > 0 ? (
                <ul style={listStyle}>
                  {plan.planRefundRules.map((r, i) => (
                    <li key={i} style={{ ...listItemStyle, paddingLeft: 0, listStyle: 'disc', marginLeft: 18 }}>{r}</li>
                  ))}
                </ul>
              ) : (
                <p style={{ color: '#9ca3af', fontSize: 14 }}>請在後台填寫取消政策</p>
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
  display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14, lineHeight: 1.5,
};
const iconStyle: React.CSSProperties = {
  width: 22, flexShrink: 0, textAlign: 'center',
};
const sectionHeadStyle: React.CSSProperties = {
  fontSize: 16, fontWeight: 700, margin: '0 0 14px', color: '#111827',
};
const subHeadStyle: React.CSSProperties = {
  fontSize: 14, fontWeight: 600, margin: '0 0 8px', color: '#374151',
};
const listStyle: React.CSSProperties = {
  listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8,
};
const listItemStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 14, lineHeight: 1.5, color: '#374151',
};
const checkStyle: React.CSSProperties = {
  width: 18, height: 18, borderRadius: '50%', display: 'inline-flex',
  alignItems: 'center', justifyContent: 'center', fontSize: 10,
  fontWeight: 700, flexShrink: 0, marginTop: 1,
};
const locationCardStyle: React.CSSProperties = {
  background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10,
  padding: '14px 16px', fontSize: 14, color: '#374151',
};
