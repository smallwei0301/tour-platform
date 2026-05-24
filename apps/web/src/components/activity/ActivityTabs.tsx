'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Activity, Review } from '../../fixtures/data';
import { DatePicker } from './DatePicker';
import { PlanCard } from './PlanCard';

interface Schedule {
  startAt?: string;
  start_at?: string;
  endAt?: string;
  end_at?: string;
  capacity: number;
  bookedCount?: number;
  booked_count?: number;
  status?: string;
  id?: string;
}

interface ActivityTabsProps {
  activity: Activity;
  reviews: Review[];
  schedules: Schedule[];
}

const TABS = ['方案', '評價', '商品說明', '購買須知'] as const;
type TabKey = (typeof TABS)[number];

export function ActivityTabs({ activity, reviews, schedules }: ActivityTabsProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('方案');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  return (
    <div className="tp-activity-tabs-wrap">
      {/* Tab Nav */}
      <div className="tp-activity-tab-nav" role="tablist" aria-label="行程詳情分頁">
        {TABS.map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            aria-controls={`tab-panel-${tab}`}
            id={`tab-${tab}`}
            className={`tp-activity-tab-btn${activeTab === tab ? ' active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div
        className="tp-activity-tab-content"
        role="tabpanel"
        id={`tab-panel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
      >
        {activeTab === '方案' && (
          <div>
            {/* Date Picker */}
            <div className="tp-tab-section">
              <div className="tp-tab-section-head">
                <h3>出發日期</h3>
                <Link href="/activities" className="tp-link" style={{ fontSize: 13 }}>更多日期 &gt;</Link>
              </div>
              <DatePicker
                schedules={schedules}
                selectedDate={selectedDate}
                onSelect={setSelectedDate}
              />
            </div>

            {/* Plan Cards */}
            <div className="tp-tab-section" style={{ marginTop: 24 }}>
              <h3>選擇方案</h3>
              <PlanCard
                activity={activity}
                selectedDate={selectedDate}
                schedules={schedules}
              />
            </div>
          </div>
        )}

        {activeTab === '評價' && (
          <div>
            <p style={{ marginBottom: 16 }}>
              <span style={{ color: '#f5a623', fontSize: 20, fontWeight: 700 }}>★ 5.0</span>
              <span style={{ color: 'var(--tp-muted)', marginLeft: 8 }}>共 {reviews.length} 則評價</span>
            </p>
            {activity.socialProofQuotes.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                {activity.socialProofQuotes.map((q, i) => (
                  <span
                    key={i}
                    style={{
                      background: 'var(--tp-bg-soft)',
                      border: '1px solid var(--tp-border)',
                      padding: '6px 12px',
                      borderRadius: 20,
                      fontSize: 13,
                    }}
                  >
                    💬 {q}
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: 'grid', gap: 12 }}>
              {reviews.map((r) => (
                <div
                  key={r.id}
                  style={{
                    background: 'var(--tp-bg-soft)',
                    border: '1px solid var(--tp-border)',
                    borderRadius: 10,
                    padding: 14,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: 6,
                    }}
                  >
                    <strong>
                      {r.author}（{r.city}）
                    </strong>
                    <span style={{ color: 'var(--tp-muted)', fontSize: 13 }}>{r.date}</span>
                  </div>
                  <p style={{ color: '#f5a623', margin: '0 0 6px' }}>
                    {'★'.repeat(r.rating)}
                  </p>
                  <p style={{ margin: 0, lineHeight: 1.6 }}>{r.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === '商品說明' && (
          <div style={{ lineHeight: 1.8, color: 'var(--tp-muted)' }}>
            <h3>行程包含</h3>
            <ul style={{ paddingLeft: 18 }}>
              {activity.inclusions.map((item, i) => (
                <li key={i}>✅ {item}</li>
              ))}
            </ul>
            <h3 style={{ marginTop: 16 }}>行程不含</h3>
            <ul style={{ paddingLeft: 18 }}>
              {activity.exclusions.map((item, i) => (
                <li key={i}>❌ {item}</li>
              ))}
            </ul>
            <h3 style={{ marginTop: 16 }}>適合對象</h3>
            <ul style={{ paddingLeft: 18 }}>
              {activity.goodFor.map((item, i) => (
                <li key={i}>👍 {item}</li>
              ))}
            </ul>
          </div>
        )}

        {activeTab === '購買須知' && (
          <div style={{ lineHeight: 1.8 }}>
            <h3>注意事項</h3>
            <ul style={{ paddingLeft: 18, color: 'var(--tp-muted)' }}>
              {activity.notices.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
            <h3 style={{ marginTop: 16 }}>取消與退款政策</h3>
            <ul style={{ paddingLeft: 18, color: 'var(--tp-muted)' }}>
              {activity.refundRules.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
            <h3 style={{ marginTop: 16 }}>安全說明</h3>
            <p style={{ color: 'var(--tp-muted)' }}>{activity.safetyNotice}</p>
          </div>
        )}
      </div>
    </div>
  );
}
