'use client';

// #1615 第一批：admin 導遊時間管理頁（app/admin/guides/[guideId]/availability/
// page.tsx）專屬的三大區塊子元件——每週規則卡、休假清單卡、時段預覽卡——
// 與其資料型別。純結構搬移：JSX、文案、data-testid 與原頁面逐字相同；
// 狀態與 handler 仍留在頁面，經 props 注入（props 名稱沿用頁面內原識別字）。

import type {
  describePlanSeasonStatus,
  describePreviewReason,
  UiActiveSeasonSummary,
} from '../../lib/availability-v2/canonical-availability-ui';
import { bookingTypeLabelZh } from '../../lib/booking-type-flow.mjs';
import { Card, Badge, EmptyState } from '../admin/ui';
import {
  WEEKDAYS,
  WEEKDAY_LABELS,
  toneStyles,
  btn,
  smallBtn,
  formatParticipants,
  type BlackoutDate,
} from './shared';

// ── admin 頁資料型別（自頁面原樣搬入；與 guide 版差異：use_dynamic_reemit
//    為可選、PreviewSlot 帶 canonicalState／conflictOverride） ──

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
  use_dynamic_reemit?: boolean;
  activity_plans?: { id: string; name: string } | null;
};

export type PreviewSlot = {
  startAt: string;
  endAt: string;
  isAvailable: boolean;
  canonicalState?: string | null;
  conflictOverride?: {
    id: string;
    reason: string;
    requiresHelper: boolean;
    helperStatus: string;
    guideNote?: string | null;
    adminNote?: string | null;
    createdAt?: string | null;
    createdByAdminEmail?: string | null;
  } | null;
};

export type Guide = {
  id: string;
  display_name: string;
};

export type V2Plan = {
  id: string;
  name: string;
  status: string;
  booking_type: string;
  base_price: number;
  minParticipants?: number | null;
  maxParticipants?: number | null;
  isYearRound?: boolean | null;
  activeSeasonSummaries?: UiActiveSeasonSummary[];
};

export type V2Activity = {
  id: string;
  title: string;
  slug: string;
  plans: V2Plan[];
};

export function getSlotStatusLabel(slot: PreviewSlot): string {
  if (slot.canonicalState === 'blocked_by_conflict') return '既有衝突';
  if (slot.canonicalState === 'allowed_with_admin_override') return '管理員覆寫後可開放';
  return slot.isAvailable ? '可預約' : '不可預約';
}

// ── Weekly Rules ──（每週可預約時段卡片）
export function AdminWeeklyRulesSection({
  rules,
  activityByPlanId,
  planById,
  openRuleModal,
  deleteRule,
}: {
  rules: AvailabilityRule[];
  activityByPlanId: Record<string, V2Activity>;
  planById: Record<string, V2Plan>;
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
    <Card style={{ padding: 0 }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>每週可預約時段</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>設定導遊每週的固定可預約時間</p>
        </div>
        <button onClick={() => openRuleModal()} style={btn('#7c3aed', '#fff')}>
          + 新增時段
        </button>
      </div>
      <div style={{ padding: 20 }}>
        {rules.length === 0 ? (
          <EmptyState message="尚未設定可預約時段" />
        ) : (
          <div className="admin-day-strip">
            {[0, 1, 2, 3, 4, 5, 6].map((day) => (
              <div key={day} style={{ background: '#f9fafb', borderRadius: 12, padding: 12, minHeight: 100, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: day === 0 || day === 6 ? '#dc2626' : '#111' }}>
                  {WEEKDAY_LABELS[day]}
                </div>
                {rulesByWeekday[day]?.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {rulesByWeekday[day].map((rule) => (
                      <div
                        key={rule.id}
                        style={{
                          background: rule.is_active ? '#dcfce7' : '#f3f4f6',
                          borderRadius: 6,
                          padding: '6px 10px',
                          fontSize: 12,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <span>
                          {rule.start_time_local}-{rule.end_time_local}
                          {rule.effective_from && rule.effective_to && rule.effective_from === rule.effective_to ? (
                            <span style={{ display: 'block', fontSize: 10, color: '#7c3aed', marginTop: 1 }}>
                              單日：{rule.effective_from}
                            </span>
                          ) : null}
                          {rule.activity_plan_id && activityByPlanId[rule.activity_plan_id]?.title ? (
                            <span style={{ display: 'block', fontSize: 10, color: '#6b7280', marginTop: 1 }}>
                              活動：{activityByPlanId[rule.activity_plan_id].title}
                            </span>
                          ) : null}
                          {rule.activity_plan_id ? (
                            <span style={{ display: 'block', fontSize: 10, color: '#6b7280', marginTop: 1 }}>
                              方案：{planById[rule.activity_plan_id]?.name || rule.activity_plans?.name || '未指定'}
                            </span>
                          ) : (
                            <span style={{ display: 'block', fontSize: 10, color: '#9ca3af', marginTop: 1 }}>所有方案</span>
                          )}
                          {rule.activity_plan_id && planById[rule.activity_plan_id] ? (
                            <span style={{ display: 'block', fontSize: 10, color: '#6b7280', marginTop: 1 }}>
                              人數：{formatParticipants(planById[rule.activity_plan_id].minParticipants, planById[rule.activity_plan_id].maxParticipants)}
                            </span>
                          ) : null}
                          {(rule.effective_from || rule.effective_to) && !(rule.effective_from && rule.effective_to && rule.effective_from === rule.effective_to) ? (
                            <span style={{ display: 'block', fontSize: 10, color: '#9ca3af', marginTop: 1 }}>
                              生效：{rule.effective_from || '不限'} ~ {rule.effective_to || '不限'}
                            </span>
                          ) : null}
                        </span>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => openRuleModal(rule)} style={smallBtn('#fff', '#374151')}>
                            編輯
                          </button>
                          <button onClick={() => deleteRule(rule.id)} style={smallBtn('#fee2e2', '#dc2626')}>
                            刪除
                          </button>
                        </div>
                      </div>
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
    </Card>
  );
}

// ── Blackout Dates ──（休假/不可預約時段卡片）
export function AdminBlackoutSection({
  blackouts,
  openBlackoutModal,
  deleteBlackout,
}: {
  blackouts: BlackoutDate[];
  openBlackoutModal: () => void;
  deleteBlackout: (blackoutId: string) => void;
}) {
  return (
    <Card style={{ padding: 0 }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>休假/不可預約時段</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>設定特定日期的休假或不可接單時間</p>
        </div>
        <button onClick={openBlackoutModal} style={btn('#dc2626', '#fff')}>
          + 新增休假
        </button>
      </div>
      <div style={{ padding: 20 }}>
        {blackouts.length === 0 ? (
          <EmptyState message="尚無休假設定" />
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
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {new Date(b.starts_at).toLocaleString('zh-TW')} ~ {new Date(b.ends_at).toLocaleString('zh-TW')}
                  </div>
                  {b.reason && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{b.reason}</div>}
                  <Badge variant={b.source === 'manual' ? 'warning' : 'default'}>{b.source === 'manual' ? '手動設定' : '系統設定'}</Badge>
                </div>
                <button onClick={() => deleteBlackout(b.id)} style={smallBtn('#fff', '#dc2626')}>
                  刪除
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

// ── Slot Preview ──（時段預覽卡片；含 #1257 例外開放 CTA 與 help 連結）
export function AdminSlotPreviewSection({
  v2Activities,
  previewPlanId,
  setPreviewPlanId,
  previewDateFrom,
  setPreviewDateFrom,
  previewDateTo,
  setPreviewDateTo,
  loadPreview,
  previewLoading,
  previewNotice,
  previewPlanSeasonStatus,
  previewReason,
  previewCanonicalState,
  previewSeasonGate,
  previewSlots,
  previewActivity,
  previewPlan,
  openConflictOverrideModal,
}: {
  v2Activities: V2Activity[];
  previewPlanId: string;
  setPreviewPlanId: (value: string) => void;
  previewDateFrom: string;
  setPreviewDateFrom: (value: string) => void;
  previewDateTo: string;
  setPreviewDateTo: (value: string) => void;
  loadPreview: () => void;
  previewLoading: boolean;
  previewNotice: string | null;
  previewPlanSeasonStatus: ReturnType<typeof describePlanSeasonStatus>;
  previewReason: ReturnType<typeof describePreviewReason>;
  previewCanonicalState: string | null;
  previewSeasonGate: string | null;
  previewSlots: PreviewSlot[];
  previewActivity: V2Activity | null;
  previewPlan: V2Plan | null;
  openConflictOverrideModal: (slot: PreviewSlot) => void;
}) {
  // ── Group preview slots by date ──
  const slotsByDate = previewSlots.reduce((acc, slot) => {
    const date = slot.startAt.slice(0, 10);
    if (!acc[date]) acc[date] = [];
    acc[date].push(slot);
    return acc;
  }, {} as Record<string, PreviewSlot[]>);

  return (
    <Card style={{ padding: 0 }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>時段預覽</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>
            預覽系統將產生的可預約時段{' '}
            <a href="/admin/help/conflict-override" target="_blank" rel="noopener noreferrer" style={{ color: '#6d28d9', fontWeight: 600, textDecoration: 'none' }}>
              · 📖 例外開放衝突時段說明
            </a>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {v2Activities.length > 0 && (
            <select
              aria-label="預覽方案篩選"
              value={previewPlanId}
              onChange={(e) => setPreviewPlanId(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 13 }}
            >
              <option value="">所有方案 (60分鐘預覽)</option>
              {v2Activities.flatMap((a) =>
                a.plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {a.title} — {p.name}（{bookingTypeLabelZh(p.booking_type)}）
                  </option>
                ))
              )}
            </select>
          )}
          <input
            type="date"
            value={previewDateFrom}
            onChange={(e) => setPreviewDateFrom(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 13 }}
          />
          <span>~</span>
          <input
            type="date"
            value={previewDateTo}
            onChange={(e) => setPreviewDateTo(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 13 }}
          />
          <button onClick={loadPreview} disabled={previewLoading} style={smallBtn('#7c3aed', '#fff')}>
            {previewLoading ? '載入中...' : '更新預覽'}
          </button>
        </div>
      </div>
      <div style={{ padding: 20 }}>
        {previewNotice ? (
          <div
            data-testid="preview-scheduled-notice"
            style={{ marginBottom: 12, border: '1px solid #c7d2fe', background: '#eef2ff', borderRadius: 10, padding: '10px 12px', color: '#3730a3' }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>排程預約方案</div>
            <div style={{ fontSize: 12, lineHeight: 1.6 }}>{previewNotice}</div>
          </div>
        ) : (
        <div style={{ marginBottom: 12, border: `1px solid ${toneStyles[previewPlanSeasonStatus.tone].border}`, background: toneStyles[previewPlanSeasonStatus.tone].background, borderRadius: 10, padding: '10px 12px', color: toneStyles[previewPlanSeasonStatus.tone].color }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{previewPlanSeasonStatus.title}</div>
          <div style={{ fontSize: 12, lineHeight: 1.6 }}>{previewPlanSeasonStatus.description}</div>
        </div>
        )}
        {!previewNotice && (
        <div style={{ marginBottom: 12, border: `1px solid ${toneStyles[previewReason.tone].border}`, background: toneStyles[previewReason.tone].background, borderRadius: 10, padding: '10px 12px', color: toneStyles[previewReason.tone].color }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>此期間無產生可預約時段時，請先確認 canonical 原因</div>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{previewReason.label}</div>
          <div style={{ fontSize: 12, lineHeight: 1.6 }}>{previewReason.description}</div>
          <div style={{ marginTop: 6, fontSize: 12 }}>可能原因包含管理員覆寫、已有衝突，或方案開放季節尚未設定。</div>
          <div style={{ marginTop: 4, fontSize: 12 }}>previewCanonicalState：{previewCanonicalState || 'N/A'}／previewSeasonGate：{previewSeasonGate || 'N/A'}</div>
        </div>
        )}
        {previewNotice ? (
          <EmptyState message="排程預約方案不套用動態時段預覽，請至「場次管理」檢視固定場次。" />
        ) : previewSlots.length === 0 ? (
          <EmptyState message={`此期間無可用時段：${previewReason.label}`} />
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
                          padding: '8px 10px',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 500,
                          minWidth: 160,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <span>{new Date(slot.startAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}</span>
                          <span style={{ fontSize: 11, fontWeight: 700 }}>{getSlotStatusLabel(slot)}</span>
                        </div>
                        {slot.conflictOverride?.reason && (
                          <div style={{ marginTop: 6, fontSize: 11, color: '#374151', lineHeight: 1.6 }}>
                            {slot.conflictOverride.reason}
                          </div>
                        )}
                        {slot.conflictOverride?.requiresHelper && (
                          <div style={{ marginTop: 4, fontSize: 11, color: '#92400e' }}>
                            需要助手
                          </div>
                        )}
                        {slot.canonicalState === 'blocked_by_conflict' && previewPlanId && previewActivity && previewPlan && (
                          <button
                            onClick={() => openConflictOverrideModal(slot)}
                            style={{ ...smallBtn('#7c3aed', '#fff'), marginTop: 8 }}
                          >
                            例外開放此場
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}
