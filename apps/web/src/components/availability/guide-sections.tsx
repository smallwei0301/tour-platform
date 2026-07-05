'use client';

// #1615 第一批：guide 時間管理頁（app/guide/availability/page.tsx）專屬的
// 三大區塊子元件——每週規則卡、休假清單卡、時段預覽卡——與其資料型別。
// 純結構搬移：JSX、文案、data-testid 與原頁面逐字相同；狀態與 handler
// 仍留在頁面，經 props 注入（props 名稱沿用頁面內原識別字以利對照）。

import type React from 'react';
import type {
  describePlanSeasonStatus,
  describePreviewReason,
  UiActiveSeasonSummary,
} from '../../lib/availability-v2/canonical-availability-ui';
import { formatSlotRangeLabel } from '../../lib/slot-generator';
import { bookingTypeLabelZh } from '../../lib/booking-type-flow.mjs';
import {
  WEEKDAYS,
  WEEKDAY_LABELS,
  toHhMm,
  toneStyles,
  btn,
  smallBtn,
  cardStyle,
  formatParticipants,
  type BlackoutDate,
} from './shared';

// ── guide 頁資料型別（自頁面原樣搬入） ──

export type AvailabilityRule = {
  id: string;
  guide_id: string;
  activity_plan_id: string | null;
  weekday: number;
  start_time_local: string;
  end_time_local: string;
  timezone: string;
  slot_interval_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  effective_from: string | null;
  effective_to: string | null;
  is_active: boolean;
  use_dynamic_reemit: boolean;
  activity_plans?: { id: string; name: string } | null;
};

export type PreviewSlot = {
  startAt: string;
  endAt: string;
  isAvailable: boolean;
  minParticipants?: number | null;
};

export type PreviewSource = 'legacy_local_preview' | 'effective_booking_availability' | string;

export type PreviewReasonCode = string | null;

export type GuideActivityPlanOption = {
  activityId: string;
  activityTitle: string;
  planId: string;
  planName: string;
  durationMinutes: number | null;
  minParticipants: number | null;
  maxParticipants: number | null;
  bookingType?: string | null;
  isYearRound?: boolean | null;
  activeSeasonSummaries?: UiActiveSeasonSummary[];
};

const badgeStyle = (variant: 'warning' | 'default'): React.CSSProperties => ({
  display: 'inline-block',
  padding: '2px 8px',
  borderRadius: 6,
  fontSize: 11,
  fontWeight: 600,
  marginTop: 4,
  background: variant === 'warning' ? '#fef3c7' : '#f3f4f6',
  color: variant === 'warning' ? '#d97706' : '#6b7280',
});

// Single rule card — shared by desktop 7-col grid and mobile stacked list.
function RuleCard({
  rule,
  optionByPlanId: opts,
  onEdit,
  onDelete,
}: {
  rule: AvailabilityRule;
  optionByPlanId: Record<string, GuideActivityPlanOption>;
  onEdit: (rule: AvailabilityRule) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div
      style={{
        background: rule.is_active ? '#dcfce7' : '#f3f4f6',
        borderRadius: 6,
        padding: '6px 10px',
        fontSize: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontWeight: 600 }}>
          {toHhMm(rule.start_time_local)}-{toHhMm(rule.end_time_local)}
        </span>
      </div>
      <div style={{ fontSize: 11, color: '#374151', marginBottom: 4 }}>
        活動：{opts[rule.activity_plan_id || '']?.activityTitle || '未指定'}
      </div>
      <div style={{ fontSize: 11, color: '#374151', marginBottom: 4 }}>
        方案：{opts[rule.activity_plan_id || '']?.planName || rule.activity_plans?.name || '未指定'}
      </div>
      {rule.activity_plan_id && opts[rule.activity_plan_id] && (
        <div style={{ fontSize: 11, color: '#374151', marginBottom: 4 }}>
          人數：{formatParticipants(
            opts[rule.activity_plan_id]?.minParticipants ?? null,
            opts[rule.activity_plan_id]?.maxParticipants ?? null
          )}
        </div>
      )}
      {(rule.effective_from || rule.effective_to) && (
        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>
          生效：{rule.effective_from || '不限'} ~ {rule.effective_to || '不限'}
        </div>
      )}
      <div style={{ display: 'flex', gap: 4 }}>
        <button onClick={() => onEdit(rule)} style={smallBtn('#fff', '#374151')}>
          編輯
        </button>
        <button onClick={() => onDelete(rule.id)} style={smallBtn('#fee2e2', '#dc2626')}>
          刪除
        </button>
      </div>
    </div>
  );
}

// ── Weekly Rules ──（每週可預約時段卡片）
export function GuideWeeklyRulesSection({
  isMobile,
  rules,
  optionByPlanId,
  openRuleModal,
  deleteRule,
}: {
  isMobile: boolean;
  rules: AvailabilityRule[];
  optionByPlanId: Record<string, GuideActivityPlanOption>;
  openRuleModal: (rule?: AvailabilityRule) => void;
  deleteRule: (ruleId: string) => void;
}) {
  // ── Group rules by weekday ──
  const rulesByWeekday = rules.reduce((acc, rule) => {
    if (!acc[rule.weekday]) acc[rule.weekday] = [];
    acc[rule.weekday].push(rule);
    return acc;
  }, {} as Record<number, AvailabilityRule[]>);

  return (
    <div style={cardStyle}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>每週可預約時段</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>設定您每週的固定可預約時間</p>
        </div>
        <button onClick={() => openRuleModal()} style={btn('#7c3aed', '#fff')}>
          + 新增時段
        </button>
      </div>
      <div style={{ padding: 20 }}>
        {rules.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>尚未設定可預約時段</div>
        ) : isMobile ? (
          // Mobile: weekdays stacked vertically; weekday header + full-width
          // rule cards. Skip weekdays with no rules to avoid 7 tall empty blocks.
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[0, 1, 2, 3, 4, 5, 6].map((day) => {
              const dayRules = rulesByWeekday[day] || [];
              if (dayRules.length === 0) return null;
              return (
                <div key={day}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: day === 0 || day === 6 ? '#dc2626' : '#111' }}>
                    {WEEKDAY_LABELS[day]}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {dayRules.map((rule) => (
                      <RuleCard key={rule.id} rule={rule} optionByPlanId={optionByPlanId} onEdit={openRuleModal} onDelete={deleteRule} />
                    ))}
                  </div>
                </div>
              );
            })}
            {[0, 1, 2, 3, 4, 5, 6].every((day) => !(rulesByWeekday[day]?.length)) && (
              <div style={{ textAlign: 'center', padding: 24, color: '#9ca3af' }}>尚未設定可預約時段</div>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
            {[0, 1, 2, 3, 4, 5, 6].map((day) => (
              <div key={day} style={{ background: '#f9fafb', borderRadius: 12, padding: 12, minHeight: 100 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: day === 0 || day === 6 ? '#dc2626' : '#111' }}>
                  {WEEKDAY_LABELS[day]}
                </div>
                {rulesByWeekday[day]?.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {rulesByWeekday[day].map((rule) => (
                      <RuleCard key={rule.id} rule={rule} optionByPlanId={optionByPlanId} onEdit={openRuleModal} onDelete={deleteRule} />
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: '#9ca3af' }}>無時段</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Blackout Dates ──（休假/不可預約時段卡片）
export function GuideBlackoutSection({
  blackouts,
  openBlackoutModal,
  deleteBlackout,
}: {
  blackouts: BlackoutDate[];
  openBlackoutModal: (blackout?: BlackoutDate) => void;
  deleteBlackout: (blackoutId: string) => void;
}) {
  return (
    <div style={cardStyle}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>休假/不可預約時段</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>設定特定日期的休假或不可接單時間</p>
        </div>
        <button onClick={() => openBlackoutModal()} style={btn('#dc2626', '#fff')}>
          + 新增休假
        </button>
      </div>
      <div style={{ padding: 20 }}>
        {blackouts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>尚無休假設定</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {blackouts.map((b) => (
              <div
                key={b.id}
                style={{
                  background: '#fef2f2',
                  borderRadius: 8,
                  padding: '12px 16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {new Date(b.starts_at).toLocaleString('zh-TW')} ~ {new Date(b.ends_at).toLocaleString('zh-TW')}
                  </div>
                  {b.reason && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{b.reason}</div>}
                  <span style={badgeStyle(b.source === 'manual' ? 'warning' : 'default')}>
                    {b.source === 'manual' ? '手動設定' : '系統設定'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => openBlackoutModal(b)} style={smallBtn('#fff', '#7c3aed')}>
                    編輯
                  </button>
                  <button onClick={() => deleteBlackout(b.id)} style={smallBtn('#fff', '#dc2626')}>
                    刪除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Slot Preview ──（時段預覽卡片；含 #1289 AC3 buffer 提示與 range 標籤）
export function GuideSlotPreviewSection({
  isMobile,
  rules,
  activityPlanOptions,
  previewPlanId,
  setPreviewPlanId,
  previewDateFrom,
  setPreviewDateFrom,
  previewDateTo,
  setPreviewDateTo,
  loadPreview,
  previewLoading,
  previewError,
  previewSource,
  previewReasonCode,
  previewCanonicalState,
  previewSeasonGate,
  previewNotice,
  previewPlan,
  previewPlanSeasonStatus,
  previewReason,
  previewSlots,
}: {
  isMobile: boolean;
  rules: AvailabilityRule[];
  activityPlanOptions: GuideActivityPlanOption[];
  previewPlanId: string;
  setPreviewPlanId: (value: string) => void;
  previewDateFrom: string;
  setPreviewDateFrom: (value: string) => void;
  previewDateTo: string;
  setPreviewDateTo: (value: string) => void;
  loadPreview: () => void;
  previewLoading: boolean;
  previewError: string | null;
  previewSource: PreviewSource;
  previewReasonCode: PreviewReasonCode;
  previewCanonicalState: string | null;
  previewSeasonGate: string | null;
  previewNotice: string | null;
  previewPlan: GuideActivityPlanOption | null;
  previewPlanSeasonStatus: ReturnType<typeof describePlanSeasonStatus>;
  previewReason: ReturnType<typeof describePreviewReason>;
  previewSlots: PreviewSlot[];
}) {
  // ── Group preview slots by date ──
  const slotsByDate = previewSlots.reduce((acc, slot) => {
    const date = slot.startAt.slice(0, 10);
    if (!acc[date]) acc[date] = [];
    acc[date].push(slot);
    return acc;
  }, {} as Record<string, PreviewSlot[]>);

  // AC3: derive buffer note from rules matching the preview plan (section-level hint)
  const previewBufferNote = (() => {
    const matchingRules = rules.filter((r) =>
      r.is_active && (r.activity_plan_id === null || r.activity_plan_id === previewPlanId || !previewPlanId)
    );
    const maxBuffer = matchingRules.reduce((max, r) => {
      const b = Math.max(r.buffer_before_minutes || 0, r.buffer_after_minutes || 0);
      return b > max ? b : max;
    }, 0);
    if (maxBuffer === 0) return null;
    const beforeMax = matchingRules.reduce((max, r) => Math.max(max, r.buffer_before_minutes || 0), 0);
    const afterMax = matchingRules.reduce((max, r) => Math.max(max, r.buffer_after_minutes || 0), 0);
    if (beforeMax === afterMax && beforeMax > 0) return `前後${beforeMax}分鐘緩衝`;
    if (beforeMax > 0 && afterMax > 0) return `前${beforeMax}分鐘、後${afterMax}分鐘緩衝`;
    if (beforeMax > 0) return `前${beforeMax}分鐘緩衝`;
    return `後${afterMax}分鐘緩衝`;
  })();

  return (
    <div style={cardStyle}>
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid #f0f0f0',
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          justifyContent: 'space-between',
          alignItems: isMobile ? 'stretch' : 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>時段預覽</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>預覽系統將產生的可預約時段</p>
        </div>
        {/* On mobile, stack each control on its own row so the native
            date picker can be tapped without overflowing the viewport. */}
        <div
          style={{
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            alignItems: isMobile ? 'stretch' : 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <select
            aria-label="篩選方案"
            value={previewPlanId}
            onChange={(e) => setPreviewPlanId(e.target.value)}
            style={{
              padding: '6px 10px',
              borderRadius: 6,
              border: '1px solid #e5e7eb',
              fontSize: 13,
              minWidth: 0,
              flex: isMobile ? undefined : '1 1 240px',
              width: isMobile ? '100%' : undefined,
              boxSizing: 'border-box',
            }}
          >
            <option value="">全部方案（不篩選）</option>
            {activityPlanOptions.map((plan) => (
              <option key={plan.planId} value={plan.planId}>
                {`${plan.activityTitle}・${plan.planName}（${bookingTypeLabelZh(plan.bookingType)}・${formatParticipants(plan.minParticipants, plan.maxParticipants)}）`}
              </option>
            ))}
          </select>
          <input
            type="date"
            aria-label="預覽起日"
            value={previewDateFrom}
            onChange={(e) => setPreviewDateFrom(e.target.value)}
            style={{
              padding: '6px 10px',
              borderRadius: 6,
              border: '1px solid #e5e7eb',
              fontSize: 13,
              minWidth: 0,
              width: isMobile ? '100%' : undefined,
              boxSizing: 'border-box',
            }}
          />
          <span style={{ display: isMobile ? 'none' : 'inline' }}>~</span>
          <input
            type="date"
            aria-label="預覽迄日"
            value={previewDateTo}
            onChange={(e) => setPreviewDateTo(e.target.value)}
            style={{
              padding: '6px 10px',
              borderRadius: 6,
              border: '1px solid #e5e7eb',
              fontSize: 13,
              minWidth: 0,
              width: isMobile ? '100%' : undefined,
              boxSizing: 'border-box',
            }}
          />
          <button
            onClick={loadPreview}
            disabled={previewLoading}
            style={{ ...smallBtn('#7c3aed', '#fff'), width: isMobile ? '100%' : undefined }}
          >
            {previewLoading ? '載入中...' : '更新預覽'}
          </button>
        </div>
      </div>
      <div style={{ padding: 20 }}>
        {previewError && (
          <div
            data-testid="guide-availability-preview-error"
            style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', fontSize: 13 }}
          >
            ⚠️ {previewError}
          </div>
        )}
        <div
          data-testid="guide-availability-preview-contract"
          style={{
            marginBottom: 12,
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid #e5e7eb',
            background: '#f9fafb',
            fontSize: 12,
            color: '#374151',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div data-testid="guide-preview-source-label">預覽來源：{previewSource}</div>
          <div data-testid="guide-preview-reason-label">原因代碼：{previewReasonCode || 'N/A'}</div>
          <div>previewCanonicalState：{previewCanonicalState || 'N/A'}</div>
          <div>previewSeasonGate：{previewSeasonGate || 'N/A'}</div>
          {previewSource === 'legacy_local_preview' && (
            <div data-testid="guide-preview-legacy-warning" style={{ color: '#92400e' }}>
              注意：目前為 local/legacy 預覽，僅供排班參考，不代表旅客端最終可訂狀態。
            </div>
          )}
        </div>
        {previewNotice && (
          <div
            data-testid="preview-scheduled-notice"
            style={{ marginBottom: 12, border: '1px solid #c7d2fe', background: '#eef2ff', borderRadius: 10, padding: '10px 12px', color: '#3730a3' }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>排程預約方案</div>
            <div style={{ fontSize: 12, lineHeight: 1.6 }}>{previewNotice}</div>
          </div>
        )}
        {previewPlan && !previewNotice && (
          <div style={{ marginBottom: 10, fontSize: 12, color: '#374151' }}>
            預覽方案：{previewPlan.planName}（{formatParticipants(previewPlan.minParticipants, previewPlan.maxParticipants)}）
            {previewBufferNote && (
              <span style={{ marginLeft: 8, color: '#6b7280' }}>・{previewBufferNote}</span>
            )}
          </div>
        )}
        {!previewNotice && (
        <div style={{ marginBottom: 12, border: `1px solid ${toneStyles[previewPlanSeasonStatus.tone].border}`, background: toneStyles[previewPlanSeasonStatus.tone].background, borderRadius: 10, padding: '10px 12px', color: toneStyles[previewPlanSeasonStatus.tone].color }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{previewPlanSeasonStatus.title}</div>
          <div style={{ fontSize: 12, lineHeight: 1.6 }}>{previewPlanSeasonStatus.description}</div>
        </div>
        )}
        {!previewNotice && (
        <div style={{ marginBottom: 12, border: `1px solid ${toneStyles[previewReason.tone].border}`, background: toneStyles[previewReason.tone].background, borderRadius: 10, padding: '10px 12px', color: toneStyles[previewReason.tone].color }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>此期間無產生可預約時段時，請先看這裡</div>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{previewReason.label}</div>
          <div style={{ fontSize: 12, lineHeight: 1.6 }}>{previewReason.description}</div>
          <div style={{ marginTop: 6, fontSize: 12 }}>可能原因包含管理員覆寫、已有衝突，或方案開放季節尚未設定。</div>
        </div>
        )}
        {previewNotice ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>
            排程預約方案不套用動態時段預覽，請至「場次管理」檢視固定場次。
          </div>
        ) : previewSlots.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>
            此期間無可用時段。
            <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>{previewReason.label}</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {Object.entries(slotsByDate).map(([date, slots]) => {
              const dayOfWeek = new Date(date).getDay();
              return (
                <div key={date}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: dayOfWeek === 0 || dayOfWeek === 6 ? '#dc2626' : '#111' }}>
                    {date} ({WEEKDAYS[dayOfWeek]})
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {slots.map((slot, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: slot.isAvailable ? '#dcfce7' : '#f3f4f6',
                          color: slot.isAvailable ? '#166534' : '#9ca3af',
                          padding: '4px 10px',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 500,
                        }}
                      >
                        {/* AC3: show full range using formatSlotRangeLabel (e.g. 09:00 – 15:00) */}
                        {formatSlotRangeLabel(slot.startAt, slot.endAt, 'Asia/Taipei')}
                        {slot.minParticipants && `・${slot.minParticipants}人成團`}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
