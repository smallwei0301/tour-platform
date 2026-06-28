'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { csrfHeaders } from '../../../../../src/lib/csrf-client';
import { Card, PageHeader, Badge, EmptyState, LoadingSkeleton } from '../../../../../src/components/admin/ui';
import { ResponsiveModal, FormGrid } from '../../../../../src/components/admin/responsive';
import {
  describePlanSeasonStatus,
  describePreviewReason,
  describeRuleSeasonConflict,
  type UiActiveSeasonSummary,
} from '../../../../../src/lib/availability-v2/canonical-availability-ui';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const WEEKDAY_LABELS = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];

type AvailabilityRule = {
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

type BlackoutDate = {
  id: string;
  guide_id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
  source: 'manual' | 'system';
};

type PreviewSlot = {
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

type ConflictOverrideForm = {
  reason: string;
  requiresHelper: boolean;
  helperStatus: string;
  guideNote: string;
  adminNote: string;
};

type Guide = {
  id: string;
  display_name: string;
};

type V2Plan = {
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

type V2Activity = {
  id: string;
  title: string;
  slug: string;
  plans: V2Plan[];
};

const CONFLICT_OVERRIDE_HELPER_LABEL: Record<string, string> = {
  not_needed: '不需要助手',
  required: '需要助手',
  pending_assignment: '待安排助手',
  assigned: '助手已安排',
  declined: '助手支援未成立',
};

const DEFAULT_CONFLICT_OVERRIDE_FORM: ConflictOverrideForm = {
  reason: '',
  requiresHelper: false,
  helperStatus: 'not_needed',
  guideNote: '',
  adminNote: '',
};

function toConflictOverrideSnapshot(override: PreviewSlot['conflictOverride'] | Record<string, unknown> | null | undefined): PreviewSlot['conflictOverride'] {
  if (!override || typeof override !== 'object') return null;
  const row = override as Record<string, unknown>;
  return {
    id: String(row.id || ''),
    reason: String(row.reason || ''),
    requiresHelper: Boolean(row.requiresHelper ?? row.requires_helper),
    helperStatus: String(row.helperStatus ?? row.helper_status ?? 'not_needed'),
    guideNote: row.guideNote == null ? String(row.guide_note ?? '') || null : String(row.guideNote) || null,
    adminNote: row.adminNote == null ? String(row.admin_note ?? '') || null : String(row.adminNote) || null,
    createdAt: row.createdAt == null ? String(row.created_at ?? '') || null : String(row.createdAt) || null,
    createdByAdminEmail: row.createdByAdminEmail == null ? String(row.created_by_admin_email ?? '') || null : String(row.createdByAdminEmail) || null,
  };
}

function getSlotStatusLabel(slot: PreviewSlot): string {
  if (slot.canonicalState === 'blocked_by_conflict') return '既有衝突';
  if (slot.canonicalState === 'allowed_with_admin_override') return '管理員覆寫後可開放';
  return slot.isAvailable ? '可預約' : '不可預約';
}

export default function GuideAvailabilityPage() {
  const params = useParams();
  const router = useRouter();
  const guideId = params.guideId as string;

  const [guide, setGuide] = useState<Guide | null>(null);
  const [rules, setRules] = useState<AvailabilityRule[]>([]);
  const [blackouts, setBlackouts] = useState<BlackoutDate[]>([]);
  const [previewSlots, setPreviewSlots] = useState<PreviewSlot[]>([]);
  const [previewCanonicalState, setPreviewCanonicalState] = useState<string | null>(null);
  const [previewSeasonGate, setPreviewSeasonGate] = useState<string | null>(null);
  const [previewIsYearRound, setPreviewIsYearRound] = useState<boolean>(false);
  const [previewActiveSeasonSummaries, setPreviewActiveSeasonSummaries] = useState<UiActiveSeasonSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [v2Activities, setV2Activities] = useState<V2Activity[]>([]);

  // Modal states
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [showBlackoutModal, setShowBlackoutModal] = useState(false);
  const [showConflictOverrideModal, setShowConflictOverrideModal] = useState(false);
  const [editingRule, setEditingRule] = useState<AvailabilityRule | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflictOverrideSaving, setConflictOverrideSaving] = useState(false);
  const [error, setError] = useState('');
  const [conflictOverrideError, setConflictOverrideError] = useState('');
  const [selectedConflictSlot, setSelectedConflictSlot] = useState<PreviewSlot | null>(null);
  const [conflictOverrideForm, setConflictOverrideForm] = useState<ConflictOverrideForm>(DEFAULT_CONFLICT_OVERRIDE_FORM);

  // Rule form state
  const [ruleForm, setRuleForm] = useState({
    rule_mode: 'weekly' as 'weekly' | 'single-day',
    single_date: '',
    weekday: 1,
    start_time_local: '09:00',
    end_time_local: '17:00',
    timezone: 'Asia/Taipei',
    slot_interval_minutes: 60,
    buffer_before_minutes: 15,
    buffer_after_minutes: 15,
    effective_from: '',
    effective_to: '',
    is_active: true,
    use_dynamic_reemit: false,
    activity_id: '' as string,
    activity_plan_id: null as string | null,
  });

  // Blackout form state
  const [blackoutForm, setBlackoutForm] = useState({
    starts_at: '',
    ends_at: '',
    reason: '',
  });

  // Preview filter plan
  const [previewPlanId, setPreviewPlanId] = useState('');

  // Preview date range
  const today = new Date().toISOString().slice(0, 10);
  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [previewDateFrom, setPreviewDateFrom] = useState(today);
  const [previewDateTo, setPreviewDateTo] = useState(nextWeek);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [rulesRes, blackoutsRes] = await Promise.all([
        fetch(`/api/v2/admin/guides/${guideId}/availability-rules`),
        fetch(`/api/v2/admin/guides/${guideId}/blackout-dates`),
      ]);
      const rulesJson = await rulesRes.json();
      const blackoutsJson = await blackoutsRes.json();

      if (rulesJson.success) setRules(rulesJson.data.rules || []);
      if (blackoutsJson.success) setBlackouts(blackoutsJson.data.blackouts || []);
    } finally {
      setLoading(false);
    }
  }, [guideId]);

  const loadPreview = useCallback(async () => {
    setPreviewLoading(true);
    try {
      const planParam = previewPlanId ? `&activityPlanId=${previewPlanId}` : '';
      const res = await fetch(
        `/api/v2/admin/guides/${guideId}/availability-preview?dateFrom=${previewDateFrom}&dateTo=${previewDateTo}&timezone=Asia/Taipei${planParam}`
      );
      const json = await res.json();
      if (json.success) {
        setGuide(json.data.guide);
        setPreviewSlots(json.data.slots || []);
        setPreviewCanonicalState(json.data.previewCanonicalState || null);
        setPreviewSeasonGate(json.data.previewSeasonGate || null);
        setPreviewIsYearRound(Boolean(json.data.isYearRound));
        setPreviewActiveSeasonSummaries(json.data.activeSeasonSummaries || []);
      }
    } finally {
      setPreviewLoading(false);
    }
  }, [guideId, previewDateFrom, previewDateTo, previewPlanId]);

  useEffect(() => {
    if (!guideId) return;
    fetch(`/api/v2/admin/guides/${guideId}/activity-plans`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.data?.activities) setV2Activities(d.data.activities);
      })
      .catch(() => {/* non-critical */});
  }, [guideId]);

  useEffect(() => {
    loadData();
    loadPreview();
  }, [loadData, loadPreview]);

  // ── Rule handlers ──
  const openRuleModal = (rule?: AvailabilityRule) => {
    if (rule) {
      setEditingRule(rule);
      // Find which activity owns this plan so we can pre-select the activity dropdown
      const boundActivity = rule.activity_plan_id
        ? v2Activities.find((a) => a.plans.some((p) => p.id === rule.activity_plan_id))
        : null;
      const isSingleDay = Boolean(rule.effective_from && rule.effective_to && rule.effective_from === rule.effective_to);
      setRuleForm({
        rule_mode: isSingleDay ? 'single-day' : 'weekly',
        single_date: isSingleDay ? (rule.effective_from || '') : '',
        weekday: rule.weekday,
        start_time_local: rule.start_time_local,
        end_time_local: rule.end_time_local,
        timezone: rule.timezone,
        slot_interval_minutes: rule.slot_interval_minutes,
        buffer_before_minutes: rule.buffer_before_minutes,
        buffer_after_minutes: rule.buffer_after_minutes,
        effective_from: rule.effective_from || '',
        effective_to: rule.effective_to || '',
        is_active: rule.is_active,
        use_dynamic_reemit: rule.use_dynamic_reemit ?? false,
        activity_id: boundActivity?.id ?? '',
        activity_plan_id: rule.activity_plan_id ?? null,
      });
    } else {
      setEditingRule(null);
      setRuleForm({
        rule_mode: 'weekly',
        single_date: '',
        weekday: 1,
        start_time_local: '09:00',
        end_time_local: '17:00',
        timezone: 'Asia/Taipei',
        slot_interval_minutes: 60,
        buffer_before_minutes: 15,
        buffer_after_minutes: 15,
        effective_from: '',
        effective_to: '',
        is_active: true,
        use_dynamic_reemit: false,
        activity_id: '',
        activity_plan_id: null,
      });
    }
    setError('');
    setShowRuleModal(true);
  };

  const saveRule = async () => {
    setSaving(true);
    setError('');
    try {
      const url = editingRule
        ? `/api/v2/admin/guides/${guideId}/availability-rules/${editingRule.id}`
        : `/api/v2/admin/guides/${guideId}/availability-rules`;
      const method = editingRule ? 'PUT' : 'POST';

      const { activity_id: _activityId, rule_mode, single_date, ...rulePayload } = ruleForm;

      // single-day: derive weekday from date, set effective_from=effective_to=single_date
      const isSingleDay = rule_mode === 'single-day';
      // TZ-safe weekday derivation aligned to resolver's getWeekdayInTimezone (Asia/Taipei).
      // Use noon-anchor (T12:00:00+08:00) to avoid midnight rollover in non-Taiwan TZ browsers:
      // noon +08:00 = 04:00 UTC → same calendar day in any timezone, getDay() returns correct Taiwan weekday.
      const weekdayFromSingleDate = single_date
        ? (() => {
            const d = new Date(`${single_date}T12:00:00+08:00`);
            const shortDay = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', weekday: 'short' }).format(d);
            return ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>)[shortDay] ?? 0;
          })()
        : rulePayload.weekday;
      const finalPayload = {
        ...rulePayload,
        weekday: isSingleDay ? weekdayFromSingleDate : rulePayload.weekday,
        activity_plan_id: ruleForm.activity_plan_id || null,
        effective_from: isSingleDay ? single_date : (rulePayload.effective_from || null),
        effective_to: isSingleDay ? single_date : (rulePayload.effective_to || null),
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify(finalPayload),
      });
      const json = await res.json();

      if (json.success) {
        setShowRuleModal(false);
        await loadData();
        await loadPreview();
      } else {
        setError(json.error?.message || '儲存失敗');
      }
    } finally {
      setSaving(false);
    }
  };

  const deleteRule = async (ruleId: string) => {
    if (!confirm('確定要刪除此時段規則嗎？')) return;
    await fetch(`/api/v2/admin/guides/${guideId}/availability-rules/${ruleId}`, { method: 'DELETE', headers: csrfHeaders() });
    await loadData();
    await loadPreview();
  };

  // ── Blackout handlers ──
  const openBlackoutModal = () => {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    setBlackoutForm({
      starts_at: now.toISOString().slice(0, 16),
      ends_at: tomorrow.toISOString().slice(0, 16),
      reason: '',
    });
    setError('');
    setShowBlackoutModal(true);
  };

  const saveBlackout = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/v2/admin/guides/${guideId}/blackout-dates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({
          starts_at: new Date(blackoutForm.starts_at).toISOString(),
          ends_at: new Date(blackoutForm.ends_at).toISOString(),
          reason: blackoutForm.reason || null,
          source: 'manual',
        }),
      });
      const json = await res.json();

      if (json.success) {
        setShowBlackoutModal(false);
        await loadData();
        await loadPreview();
      } else {
        setError(json.error?.message || '儲存失敗');
      }
    } finally {
      setSaving(false);
    }
  };

  const deleteBlackout = async (blackoutId: string) => {
    if (!confirm('確定要刪除此休假時段嗎？')) return;
    await fetch(`/api/v2/admin/guides/${guideId}/blackout-dates/${blackoutId}`, { method: 'DELETE', headers: csrfHeaders() });
    await loadData();
    await loadPreview();
  };

  const openConflictOverrideModal = (slot: PreviewSlot) => {
    setSelectedConflictSlot(slot);
    setConflictOverrideForm({ ...DEFAULT_CONFLICT_OVERRIDE_FORM });
    setConflictOverrideError('');
    setShowConflictOverrideModal(true);
  };

  const saveConflictOverride = async () => {
    if (!selectedConflictSlot || !previewPlanId) return;
    const reason = conflictOverrideForm.reason.trim();
    if (!reason) {
      setConflictOverrideError('請先填寫例外開放原因');
      return;
    }

    const selectedActivity = v2Activities.find((activity) => activity.plans.some((plan) => plan.id === previewPlanId));
    if (!selectedActivity) {
      setConflictOverrideError('目前預覽缺少活動資訊，請重新選擇方案後再試一次');
      return;
    }

    setConflictOverrideSaving(true);
    setConflictOverrideError('');
    try {
      const res = await fetch(`/api/v2/admin/guides/${guideId}/conflict-overrides`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({
          activityId: selectedActivity.id,
          activityPlanId: previewPlanId,
          startAt: selectedConflictSlot.startAt,
          endAt: selectedConflictSlot.endAt,
          reason,
          requiresHelper: conflictOverrideForm.requiresHelper,
          helperStatus: conflictOverrideForm.requiresHelper ? conflictOverrideForm.helperStatus : 'not_needed',
          guideNote: conflictOverrideForm.guideNote.trim() || null,
          adminNote: conflictOverrideForm.adminNote.trim() || null,
        }),
      });
      const json = await res.json();

      if (!res.ok || !json?.success) {
        setConflictOverrideError(json?.error?.message || '例外開放失敗');
        return;
      }

      await loadPreview();
      const overrideSnapshot = toConflictOverrideSnapshot(json?.data?.override);
      setPreviewCanonicalState((current) => current === 'blocked_by_conflict' ? 'allowed_with_admin_override' : current || 'allowed_with_admin_override');
      setPreviewSlots((current) => current.map((slot) =>
        slot.startAt === selectedConflictSlot.startAt && slot.endAt === selectedConflictSlot.endAt
          ? {
              ...slot,
              isAvailable: true,
              canonicalState: 'allowed_with_admin_override',
              conflictOverride: overrideSnapshot,
            }
          : slot,
      ));
      setShowConflictOverrideModal(false);
      setSelectedConflictSlot(null);
      setConflictOverrideForm({ ...DEFAULT_CONFLICT_OVERRIDE_FORM });
    } catch {
      setConflictOverrideError('例外開放失敗');
    } finally {
      setConflictOverrideSaving(false);
    }
  };

  // ── Group rules by weekday ──
  const rulesByWeekday = rules.reduce((acc, rule) => {
    if (!acc[rule.weekday]) acc[rule.weekday] = [];
    acc[rule.weekday].push(rule);
    return acc;
  }, {} as Record<number, AvailabilityRule[]>);
  const activityByPlanId = Object.fromEntries(v2Activities.flatMap((activity) => activity.plans.map((plan) => [plan.id, activity]))) as Record<string, V2Activity>;
  const planById = Object.fromEntries(v2Activities.flatMap((activity) => activity.plans.map((plan) => [plan.id, plan]))) as Record<string, V2Plan>;
  const selectedRulePlan = ruleForm.activity_plan_id ? planById[ruleForm.activity_plan_id] : null;
  const previewPlan = previewPlanId ? planById[previewPlanId] : null;
  const previewActivity = previewPlanId ? activityByPlanId[previewPlanId] : null;
  const rulePlanSeasonStatus = describePlanSeasonStatus({
    isYearRound: selectedRulePlan?.isYearRound,
    activeSeasonSummaries: selectedRulePlan?.activeSeasonSummaries,
  });
  const ruleSeasonConflict = selectedRulePlan
    ? describeRuleSeasonConflict({
        ruleMode: ruleForm.rule_mode,
        effectiveFrom: ruleForm.effective_from,
        effectiveTo: ruleForm.effective_to,
        singleDate: ruleForm.single_date,
        activeSeasonSummaries: selectedRulePlan.activeSeasonSummaries,
        isYearRound: selectedRulePlan.isYearRound,
      })
    : null;
  const formatParticipants = (minParticipants?: number | null, maxParticipants?: number | null) => {
    const minText = minParticipants ?? '-';
    const maxText = maxParticipants ?? '-';
    return `最少 ${minText}｜最多 ${maxText}`;
  };
  const previewPlanSeasonStatus = describePlanSeasonStatus({
    isYearRound: previewPlanId ? previewPlan?.isYearRound : previewIsYearRound,
    activeSeasonSummaries: previewPlanId ? previewPlan?.activeSeasonSummaries : previewActiveSeasonSummaries,
  });
  const previewReason = describePreviewReason({ previewCanonicalState, previewSeasonGate });
  const toneStyles = {
    success: { border: '#bbf7d0', background: '#f0fdf4', color: '#166534' },
    info: { border: '#bfdbfe', background: '#eff6ff', color: '#1d4ed8' },
    warning: { border: '#fcd34d', background: '#fffbeb', color: '#92400e' },
  } as const;

  // ── Group preview slots by date ──
  const slotsByDate = previewSlots.reduce((acc, slot) => {
    const date = slot.startAt.slice(0, 10);
    if (!acc[date]) acc[date] = [];
    acc[date].push(slot);
    return acc;
  }, {} as Record<string, PreviewSlot[]>);

  const btn = (bg: string, color: string, border = 'none') =>
    ({
      padding: '8px 16px',
      borderRadius: 8,
      border,
      background: bg,
      color,
      fontSize: 14,
      fontWeight: 600,
      cursor: 'pointer',
    }) as React.CSSProperties;

  const smallBtn = (bg: string, color: string) =>
    ({
      padding: '4px 10px',
      borderRadius: 6,
      border: 'none',
      background: bg,
      color,
      fontSize: 12,
      fontWeight: 600,
      cursor: 'pointer',
    }) as React.CSSProperties;

  return (
    <div style={{ background: '#f9fafb', minHeight: '100vh' }}>
      <PageHeader
        title="導遊時間管理"
        subtitle={guide ? `${guide.display_name} 的可預約時段設定` : '載入中...'}
        actions={
          <button onClick={() => router.push('/admin/guides')} style={btn('#fff', '#374151', '1px solid #d1d5db')}>
            ← 返回導遊列表
          </button>
        }
      />

      {/* ── Rule Modal ── */}
      <ResponsiveModal
        open={showRuleModal}
        onClose={() => setShowRuleModal(false)}
        size="sm"
        title={editingRule ? '編輯時段規則' : '新增時段規則'}
      >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Activity selector */}
              {v2Activities.length > 0 && (
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>活動</label>
                  <select
                    aria-label="活動"
                    value={ruleForm.activity_id}
                    onChange={(e) =>
                      setRuleForm({ ...ruleForm, activity_id: e.target.value, activity_plan_id: null })
                    }
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14 }}
                  >
                    <option value="">所有活動</option>
                    {v2Activities.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {/* Plan selector — only shown when an activity is selected */}
              {ruleForm.activity_id && (
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>方案</label>
                  <select
                    aria-label="方案"
                    value={ruleForm.activity_plan_id || ''}
                    onChange={(e) =>
                      setRuleForm({ ...ruleForm, activity_plan_id: e.target.value || null })
                    }
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14 }}
                  >
                    <option value="">不限方案</option>
                    {(v2Activities.find((a) => a.id === ruleForm.activity_id)?.plans || []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {`${p.name}（${formatParticipants(p.minParticipants, p.maxParticipants)}）`}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {selectedRulePlan && (
                <div style={{ border: `1px solid ${toneStyles[rulePlanSeasonStatus.tone].border}`, background: toneStyles[rulePlanSeasonStatus.tone].background, borderRadius: 10, padding: '10px 12px', color: toneStyles[rulePlanSeasonStatus.tone].color }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{rulePlanSeasonStatus.title}</div>
                  <div style={{ fontSize: 12, lineHeight: 1.6 }}>{rulePlanSeasonStatus.description}</div>
                </div>
              )}
              {selectedRulePlan && ruleSeasonConflict && (
                <div style={{ border: `1px solid ${toneStyles[ruleSeasonConflict.tone].border}`, background: toneStyles[ruleSeasonConflict.tone].background, borderRadius: 10, padding: '10px 12px', color: toneStyles[ruleSeasonConflict.tone].color, fontSize: 12, lineHeight: 1.6 }}>
                  {ruleSeasonConflict.message}
                </div>
              )}
              {selectedRulePlan && (
                <div style={{ fontSize: 12, color: '#6b7280' }}>
                  常見提示：此方案尚未設定開放季節、你設定的日期包含方案非開放季節、這一天不在方案開放季節內。
                </div>
              )}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>開放模式</label>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <label style={{ fontSize: 13 }}>
                    <input type="radio" checked={ruleForm.rule_mode === 'weekly'} onChange={() => setRuleForm({ ...ruleForm, rule_mode: 'weekly', single_date: '' })} /> 每週重複
                  </label>
                  <label style={{ fontSize: 13 }}>
                    <input type="radio" checked={ruleForm.rule_mode === 'single-day'} onChange={() => setRuleForm({ ...ruleForm, rule_mode: 'single-day' })} /> 單日開放
                  </label>
                </div>
              </div>
              {ruleForm.rule_mode === 'single-day' ? (
                <div>
                  <label htmlFor="admin-avail-single-date" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>單日日期（台灣時間）</label>
                  <input
                    id="admin-avail-single-date"
                    type="date"
                    value={ruleForm.single_date}
                    onChange={(e) => setRuleForm({ ...ruleForm, single_date: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }}
                  />
                </div>
              ) : (
                <FormGrid cols={2} gap={12}>
                  <div>
                    <label htmlFor="admin-avail-start-date" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>生效起日（可空）</label>
                    <input
                      id="admin-avail-start-date"
                      type="date"
                      value={ruleForm.effective_from}
                      onChange={(e) => setRuleForm({ ...ruleForm, effective_from: e.target.value })}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label htmlFor="admin-avail-end-date" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>生效迄日（可空）</label>
                    <input
                      id="admin-avail-end-date"
                      type="date"
                      value={ruleForm.effective_to}
                      onChange={(e) => setRuleForm({ ...ruleForm, effective_to: e.target.value })}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }}
                    />
                  </div>
                </FormGrid>
              )}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>星期</label>
                <select
                  aria-label="星期"
                  value={ruleForm.weekday}
                  onChange={(e) => setRuleForm({ ...ruleForm, weekday: Number(e.target.value) })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14 }}
                  disabled={ruleForm.rule_mode === 'single-day'}
                >
                  {WEEKDAY_LABELS.map((label, i) => (
                    <option key={i} value={i}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <FormGrid cols={2} gap={12}>
                <div>
                  <label htmlFor="admin-avail-start-time" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>開始時間</label>
                  <input
                    id="admin-avail-start-time"
                    type="time"
                    value={ruleForm.start_time_local}
                    onChange={(e) => setRuleForm({ ...ruleForm, start_time_local: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label htmlFor="admin-avail-end-time" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>結束時間</label>
                  <input
                    id="admin-avail-end-time"
                    type="time"
                    value={ruleForm.end_time_local}
                    onChange={(e) => setRuleForm({ ...ruleForm, end_time_local: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }}
                  />
                </div>
              </FormGrid>
              <FormGrid cols={2} gap={12}>
                <div>
                  <label htmlFor="admin-avail-interval-minutes" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>時段間隔 (分鐘)</label>
                  <input
                    id="admin-avail-interval-minutes"
                    type="number"
                    min="15"
                    step="15"
                    value={ruleForm.slot_interval_minutes}
                    onChange={(e) => setRuleForm({ ...ruleForm, slot_interval_minutes: Number(e.target.value) })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label htmlFor="avail-buffer-time" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>緩衝時間 (分鐘)</label>
                  <input
                    id="avail-buffer-time"
                    type="number"
                    min="0"
                    step="5"
                    value={ruleForm.buffer_before_minutes}
                    onChange={(e) =>
                      setRuleForm({
                        ...ruleForm,
                        buffer_before_minutes: Number(e.target.value),
                        buffer_after_minutes: Number(e.target.value),
                      })
                    }
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }}
                  />
                </div>
              </FormGrid>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={ruleForm.use_dynamic_reemit}
                  onChange={(e) => setRuleForm({ ...ruleForm, use_dynamic_reemit: e.target.checked })}
                />
                啟用動態時段（根據上次預訂結束時間自動補發可用時段）
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={ruleForm.is_active}
                  onChange={(e) => setRuleForm({ ...ruleForm, is_active: e.target.checked })}
                />
                啟用此規則
              </label>
              {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', color: '#dc2626', fontSize: 13 }}>
                  {error}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <button onClick={saveRule} disabled={saving} style={btn(saving ? '#a78bfa' : '#7c3aed', '#fff')}>
                  {saving ? '儲存中...' : '儲存'}
                </button>
                <button onClick={() => setShowRuleModal(false)} style={btn('#fff', '#374151', '1px solid #d1d5db')}>
                  取消
                </button>
              </div>
            </div>
      </ResponsiveModal>

      {/* ── Blackout Modal ── */}
      <ResponsiveModal
        open={showBlackoutModal}
        onClose={() => setShowBlackoutModal(false)}
        size="sm"
        title="新增休假時段"
      >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label htmlFor="admin-avail-blackout-starts-at" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>開始時間</label>
                <input
                  id="admin-avail-blackout-starts-at"
                  type="datetime-local"
                  value={blackoutForm.starts_at}
                  onChange={(e) => setBlackoutForm({ ...blackoutForm, starts_at: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label htmlFor="admin-avail-blackout-ends-at" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>結束時間</label>
                <input
                  id="admin-avail-blackout-ends-at"
                  type="datetime-local"
                  value={blackoutForm.ends_at}
                  onChange={(e) => setBlackoutForm({ ...blackoutForm, ends_at: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label htmlFor="admin-avail-blackout-reason" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>原因 (選填)</label>
                <input
                  id="admin-avail-blackout-reason"
                  type="text"
                  value={blackoutForm.reason}
                  onChange={(e) => setBlackoutForm({ ...blackoutForm, reason: e.target.value })}
                  placeholder="例：私人行程"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>
              {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', color: '#dc2626', fontSize: 13 }}>
                  {error}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <button onClick={saveBlackout} disabled={saving} style={btn(saving ? '#a78bfa' : '#7c3aed', '#fff')}>
                  {saving ? '儲存中...' : '儲存'}
                </button>
                <button onClick={() => setShowBlackoutModal(false)} style={btn('#fff', '#374151', '1px solid #d1d5db')}>
                  取消
                </button>
              </div>
            </div>
      </ResponsiveModal>

      <ResponsiveModal
        open={showConflictOverrideModal}
        onClose={() => setShowConflictOverrideModal(false)}
        size="sm"
        title="例外開放衝突時段"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ border: '1px solid #fcd34d', background: '#fffbeb', borderRadius: 10, padding: '10px 12px', color: '#92400e' }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>這不是一般新增場次</div>
            <div style={{ fontSize: 12, lineHeight: 1.6 }}>
              僅限既有預約衝突且已確認可人工覆寫的時段使用。送出後仍會保留完整原因、助手需求與備註紀錄。
            </div>
          </div>
          {selectedConflictSlot && (
            <div style={{ border: '1px solid #e5e7eb', background: '#f9fafb', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: '#374151', lineHeight: 1.7 }}>
              <div><strong>導遊：</strong>{guide?.display_name || '—'}</div>
              <div><strong>活動：</strong>{previewActivity?.title || '—'}</div>
              <div><strong>方案：</strong>{previewPlan?.name || '—'}</div>
              <div><strong>開始：</strong>{new Date(selectedConflictSlot.startAt).toLocaleString('zh-TW')}</div>
              <div><strong>結束：</strong>{new Date(selectedConflictSlot.endAt).toLocaleString('zh-TW')}</div>
            </div>
          )}
          <div>
            <label htmlFor="admin-conflict-override-reason" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>例外開放原因</label>
            <textarea
              id="admin-conflict-override-reason"
              value={conflictOverrideForm.reason}
              onChange={(e) => setConflictOverrideForm((current) => ({ ...current, reason: e.target.value }))}
              rows={3}
              placeholder="請記錄為何核准此衝突時段仍可開放預約"
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }}
            />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
            <input
              type="checkbox"
              checked={conflictOverrideForm.requiresHelper}
              onChange={(e) => setConflictOverrideForm((current) => ({
                ...current,
                requiresHelper: e.target.checked,
                helperStatus: e.target.checked ? current.helperStatus : 'not_needed',
              }))}
            />
            需要助手
          </label>
          <div>
            <label htmlFor="admin-conflict-override-helper-status" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>助手狀態</label>
            <select
              id="admin-conflict-override-helper-status"
              value={conflictOverrideForm.requiresHelper ? conflictOverrideForm.helperStatus : 'not_needed'}
              onChange={(e) => setConflictOverrideForm((current) => ({ ...current, helperStatus: e.target.value }))}
              disabled={!conflictOverrideForm.requiresHelper}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14 }}
            >
              {Object.entries(CONFLICT_OVERRIDE_HELPER_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="admin-conflict-override-guide-note" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>導遊可見備註</label>
            <textarea
              id="admin-conflict-override-guide-note"
              value={conflictOverrideForm.guideNote}
              onChange={(e) => setConflictOverrideForm((current) => ({ ...current, guideNote: e.target.value }))}
              rows={2}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label htmlFor="admin-conflict-override-admin-note" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>內部管理備註</label>
            <textarea
              id="admin-conflict-override-admin-note"
              value={conflictOverrideForm.adminNote}
              onChange={(e) => setConflictOverrideForm((current) => ({ ...current, adminNote: e.target.value }))}
              rows={2}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }}
            />
          </div>
          {conflictOverrideError && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', color: '#dc2626', fontSize: 13 }}>
              {conflictOverrideError}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <button onClick={saveConflictOverride} disabled={conflictOverrideSaving} style={btn(conflictOverrideSaving ? '#a78bfa' : '#7c3aed', '#fff')}>
              {conflictOverrideSaving ? '儲存中...' : '確認例外開放'}
            </button>
            <button onClick={() => setShowConflictOverrideModal(false)} style={btn('#fff', '#374151', '1px solid #d1d5db')}>
              取消
            </button>
          </div>
        </div>
      </ResponsiveModal>

      <div className="admin-page" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {loading ? (
          <Card>
            <LoadingSkeleton />
          </Card>
        ) : (
          <>
            {/* ── Weekly Rules ── */}
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

            {/* ── Blackout Dates ── */}
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

            {/* ── Slot Preview ── */}
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
                            {a.title} — {p.name}
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
                <div style={{ marginBottom: 12, border: `1px solid ${toneStyles[previewPlanSeasonStatus.tone].border}`, background: toneStyles[previewPlanSeasonStatus.tone].background, borderRadius: 10, padding: '10px 12px', color: toneStyles[previewPlanSeasonStatus.tone].color }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{previewPlanSeasonStatus.title}</div>
                  <div style={{ fontSize: 12, lineHeight: 1.6 }}>{previewPlanSeasonStatus.description}</div>
                </div>
                <div style={{ marginBottom: 12, border: `1px solid ${toneStyles[previewReason.tone].border}`, background: toneStyles[previewReason.tone].background, borderRadius: 10, padding: '10px 12px', color: toneStyles[previewReason.tone].color }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>此期間無產生可預約時段時，請先確認 canonical 原因</div>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{previewReason.label}</div>
                  <div style={{ fontSize: 12, lineHeight: 1.6 }}>{previewReason.description}</div>
                  <div style={{ marginTop: 6, fontSize: 12 }}>可能原因包含管理員覆寫、已有衝突，或方案開放季節尚未設定。</div>
                  <div style={{ marginTop: 4, fontSize: 12 }}>previewCanonicalState：{previewCanonicalState || 'N/A'}／previewSeasonGate：{previewSeasonGate || 'N/A'}</div>
                </div>
                {previewSlots.length === 0 ? (
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
          </>
        )}
      </div>
    </div>
  );
}
