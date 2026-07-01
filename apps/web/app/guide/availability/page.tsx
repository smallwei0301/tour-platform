'use client';

import { useEffect, useState, useCallback } from 'react';
import { csrfHeaders } from '../../../src/lib/csrf-client';
import { ResponsiveModal, FormGrid, useIsMobile } from '../../../src/components/admin/responsive';
import {
  describePlanSeasonStatus,
  describePreviewReason,
  describeRuleSeasonConflict,
  type UiActiveSeasonSummary,
} from '../../../src/lib/availability-v2/canonical-availability-ui';
import { formatSlotRangeLabel } from '../../../src/lib/slot-generator';
import { bookingTypeLabelZh, isDynamicAvailabilityApplicable } from '../../../src/lib/booking-type-flow.mjs';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const WEEKDAY_LABELS = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];

// guide_availability_rules.start_time_local / end_time_local are Postgres
// `time` columns that round-trip with seconds ("09:00:00"). A native
// <input type="time"> (and the rule card) expect HH:MM, so defensively trim
// seconds before binding/displaying — the API normalizes too, but legacy
// rows or cached state can still carry the seconds.
const toHhMm = (value: string | null | undefined): string => {
  if (!value) return '';
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return value;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
};

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
  use_dynamic_reemit: boolean;
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
  minParticipants?: number | null;
};

type PreviewSource = 'legacy_local_preview' | 'effective_booking_availability' | string;

type PreviewReasonCode = string | null;

type GuideActivityPlanOption = {
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

export default function GuideAvailabilityPage() {
  const isMobile = useIsMobile(768);
  const [rules, setRules] = useState<AvailabilityRule[]>([]);
  const [blackouts, setBlackouts] = useState<BlackoutDate[]>([]);
  const [previewSlots, setPreviewSlots] = useState<PreviewSlot[]>([]);
  const [previewSource, setPreviewSource] = useState<PreviewSource>('legacy_local_preview');
  const [previewReasonCode, setPreviewReasonCode] = useState<PreviewReasonCode>(null);
  const [previewCanonicalState, setPreviewCanonicalState] = useState<string | null>(null);
  const [previewSeasonGate, setPreviewSeasonGate] = useState<string | null>(null);
  const [previewNotice, setPreviewNotice] = useState<string | null>(null);
  const [previewIsYearRound, setPreviewIsYearRound] = useState<boolean>(false);
  const [previewActiveSeasonSummaries, setPreviewActiveSeasonSummaries] = useState<UiActiveSeasonSummary[]>([]);
  const [activityPlanOptions, setActivityPlanOptions] = useState<GuideActivityPlanOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Modal states
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [showBlackoutModal, setShowBlackoutModal] = useState(false);
  const [editingRule, setEditingRule] = useState<AvailabilityRule | null>(null);
  const [editingBlackout, setEditingBlackout] = useState<BlackoutDate | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // AC1: track whether guide manually edited the interval (to avoid overwriting on plan switch)
  const [intervalManuallyEdited, setIntervalManuallyEdited] = useState(false);

  // Rule form state
  const [ruleForm, setRuleForm] = useState({
    activity_id: '',
    activity_plan_id: '',
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
  });

  // Blackout form state
  const [blackoutForm, setBlackoutForm] = useState({
    starts_at: '',
    ends_at: '',
    reason: '',
  });

  // Preview date range
  const today = new Date().toISOString().slice(0, 10);
  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [previewDateFrom, setPreviewDateFrom] = useState(today);
  const [previewDateTo, setPreviewDateTo] = useState(nextWeek);
  const [previewPlanId, setPreviewPlanId] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [rulesRes, blackoutsRes, plansRes] = await Promise.all([
        fetch('/api/guide/availability-rules'),
        fetch('/api/guide/blackout-dates'),
        fetch('/api/guide/activities-with-plans'),
      ]);
      const rulesJson = await rulesRes.json();
      const blackoutsJson = await blackoutsRes.json();
      const plansJson = await plansRes.json();

      if (rulesJson.ok) setRules(rulesJson.data?.rules || []);
      if (blackoutsJson.ok) setBlackouts(blackoutsJson.data?.blackouts || []);
      if (plansJson.ok) setActivityPlanOptions(plansJson.data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPreview = useCallback(async () => {
    setPreviewLoading(true);
    try {
      const query = new URLSearchParams({
        dateFrom: previewDateFrom,
        dateTo: previewDateTo,
        timezone: 'Asia/Taipei',
      });
      if (previewPlanId) query.set('activityPlanId', previewPlanId);
      const res = await fetch(`/api/guide/availability-preview?${query.toString()}`);
      const json = await res.json();
      if (json.ok) {
        setPreviewError(null);
        setPreviewSource(json.data?.availabilitySource || 'legacy_local_preview');
        setPreviewReasonCode(json.data?.previewReasonCode || null);
        setPreviewCanonicalState(json.data?.previewCanonicalState || null);
        setPreviewSeasonGate(json.data?.previewSeasonGate || null);
        setPreviewNotice(json.data?.previewNotice || null);
        setPreviewIsYearRound(Boolean(json.data?.isYearRound));
        setPreviewActiveSeasonSummaries(json.data?.activeSeasonSummaries || []);
        setPreviewSlots((json.data?.slots || []).map((slot: PreviewSlot) => ({
          ...slot,
          minParticipants: slot.minParticipants ?? null,
        })));
      } else {
        // 不要靜默吞掉錯誤（例如超過預覽天數上限）：清掉舊資料並顯示原因，
        // 否則畫面會殘留上一次的預覽，讓人誤以為「只產生一天」。
        const msg = json?.error?.message || '預覽載入失敗';
        setPreviewError(
          /92 days/i.test(msg) ? '預覽範圍最多 92 天，請縮小日期區間後再試。' : msg,
        );
        setPreviewNotice(null);
        setPreviewSlots([]);
      }
    } catch {
      setPreviewError('預覽載入失敗，請稍後再試。');
      setPreviewSlots([]);
    } finally {
      setPreviewLoading(false);
    }
  }, [previewDateFrom, previewDateTo, previewPlanId]);

  useEffect(() => {
    void fetch('/api/guide/auth/csrf', { cache: 'no-store' });
    loadData();
    loadPreview();
  }, [loadData, loadPreview]);

  // ── Rule handlers ──
  const openRuleModal = (rule?: AvailabilityRule) => {
    if (rule) {
      const selectedPlan = activityPlanOptions.find((opt) => opt.planId === (rule.activity_plan_id || ''));
      const isSingleDay = Boolean(rule.effective_from && rule.effective_to && rule.effective_from === rule.effective_to);
      setEditingRule(rule);
      setIntervalManuallyEdited(false); // existing rule: treat saved value as the baseline
      setRuleForm({
        activity_id: selectedPlan?.activityId || '',
        activity_plan_id: rule.activity_plan_id || '',
        rule_mode: isSingleDay ? 'single-day' : 'weekly',
        single_date: isSingleDay ? (rule.effective_from || '') : '',
        weekday: rule.weekday,
        start_time_local: toHhMm(rule.start_time_local),
        end_time_local: toHhMm(rule.end_time_local),
        timezone: rule.timezone,
        slot_interval_minutes: rule.slot_interval_minutes,
        buffer_before_minutes: rule.buffer_before_minutes,
        buffer_after_minutes: rule.buffer_after_minutes,
        effective_from: rule.effective_from || '',
        effective_to: rule.effective_to || '',
        is_active: rule.is_active,
        use_dynamic_reemit: rule.use_dynamic_reemit ?? false,
      });
    } else {
      setEditingRule(null);
      setIntervalManuallyEdited(false); // new rule: not manually edited yet
      setRuleForm({
        activity_id: '',
        activity_plan_id: '',
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
      });
    }
    setError('');
    setShowRuleModal(true);
  };

  const saveRule = async () => {
    // 排程方案不得綁動態規則（後端亦回 422，前端先擋一層）。
    if (selectedRulePlanIsScheduled) {
      setError('排程預約方案僅使用固定場次，請改用「場次管理」。');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const url = editingRule
        ? `/api/guide/availability-rules/${editingRule.id}`
        : '/api/guide/availability-rules';
      const method = editingRule ? 'PUT' : 'POST';

      const singleDate = ruleForm.single_date;
      const weekdayFromSingleDate = singleDate ? new Date(`${singleDate}T00:00:00+08:00`).getDay() : ruleForm.weekday;
      const payload = {
        ...ruleForm,
        weekday: ruleForm.rule_mode === 'single-day' ? weekdayFromSingleDate : ruleForm.weekday,
        activity_plan_id: ruleForm.activity_plan_id || null,
        effective_from: ruleForm.rule_mode === 'single-day' ? singleDate : (ruleForm.effective_from || null),
        effective_to: ruleForm.rule_mode === 'single-day' ? singleDate : (ruleForm.effective_to || null),
      };

      const res = await fetch(url, {
        method,
        headers: csrfHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (json.ok) {
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
    await fetch(`/api/guide/availability-rules/${ruleId}`, {
      method: 'DELETE',
      headers: csrfHeaders(),
    });
    await loadData();
    await loadPreview();
  };

  // ── Blackout handlers ──
  const openBlackoutModal = (blackout?: BlackoutDate) => {
    if (blackout) {
      setEditingBlackout(blackout);
      setBlackoutForm({
        starts_at: new Date(blackout.starts_at).toISOString().slice(0, 16),
        ends_at: new Date(blackout.ends_at).toISOString().slice(0, 16),
        reason: blackout.reason || '',
      });
    } else {
      setEditingBlackout(null);
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      setBlackoutForm({
        starts_at: now.toISOString().slice(0, 16),
        ends_at: tomorrow.toISOString().slice(0, 16),
        reason: '',
      });
    }
    setError('');
    setShowBlackoutModal(true);
  };

  const saveBlackout = async () => {
    setSaving(true);
    setError('');
    try {
      const url = editingBlackout
        ? `/api/guide/blackout-dates/${editingBlackout.id}`
        : '/api/guide/blackout-dates';
      const method = editingBlackout ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: csrfHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          starts_at: new Date(blackoutForm.starts_at).toISOString(),
          ends_at: new Date(blackoutForm.ends_at).toISOString(),
          reason: blackoutForm.reason || null,
          source: 'manual',
        }),
      });
      const json = await res.json();

      if (json.ok) {
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
    await fetch(`/api/guide/blackout-dates/${blackoutId}`, {
      method: 'DELETE',
      headers: csrfHeaders(),
    });
    await loadData();
    await loadPreview();
  };

  // ── Group rules by weekday ──
  const rulesByWeekday = rules.reduce((acc, rule) => {
    if (!acc[rule.weekday]) acc[rule.weekday] = [];
    acc[rule.weekday].push(rule);
    return acc;
  }, {} as Record<number, AvailabilityRule[]>);

  const plansByActivity = activityPlanOptions.reduce((acc, option) => {
    if (!acc[option.activityId]) acc[option.activityId] = [];
    acc[option.activityId].push(option);
    return acc;
  }, {} as Record<string, GuideActivityPlanOption[]>);

  const selectedActivityPlans = plansByActivity[ruleForm.activity_id] || [];
  const optionByPlanId = activityPlanOptions.reduce((acc, option) => {
    acc[option.planId] = option;
    return acc;
  }, {} as Record<string, GuideActivityPlanOption>);
  const previewPlan = optionByPlanId[previewPlanId] || null;
  const selectedRulePlan = optionByPlanId[ruleForm.activity_plan_id] || null;
  // 排程方案只看固定場次，動態可預約時段規則對它無效（對稱 #1495）。選到排程方案時
  // 警示並停用送出，引導改用「場次管理」。
  const selectedRulePlanIsScheduled = Boolean(
    selectedRulePlan && !isDynamicAvailabilityApplicable(selectedRulePlan.bookingType)
  );
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
  const previewPlanSeasonStatus = describePlanSeasonStatus({
    isYearRound: previewPlanId ? previewPlan?.isYearRound : previewIsYearRound,
    activeSeasonSummaries: previewPlanId ? previewPlan?.activeSeasonSummaries : previewActiveSeasonSummaries,
  });
  const previewReason = describePreviewReason({
    previewCanonicalState,
    previewSeasonGate,
  });
  const formatParticipants = (minParticipants: number | null, maxParticipants: number | null) => {
    const minText = minParticipants ?? '-';
    const maxText = maxParticipants ?? '-';
    return `最少 ${minText}｜最多 ${maxText}`;
  };
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

  const cardStyle: React.CSSProperties = {
    background: '#fff',
    borderRadius: 14,
    border: '1px solid #e5e7eb',
    overflow: 'hidden',
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

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
          <span style={{ marginRight: 8 }}>&#128197;</span>
          時間管理
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 14, color: '#6b7280' }}>
          設定您的可預約時段與休假日期
        </p>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9ca3af' }}>
          所有時間皆以台灣時間 (Asia/Taipei) 顯示與儲存
        </p>
      </div>

      {/* ── Rule Modal ── ResponsiveModal already provides role=dialog /
          aria-modal / aria-labelledby (via title=) + Escape / focus trap.
          We keep PR #1063's explicit field associations (id+htmlFor on every
          date/time/number input, aria-label on every select that doesn't
          have an htmlFor). */}
      <ResponsiveModal
        open={showRuleModal}
        onClose={() => setShowRuleModal(false)}
        title={editingRule ? '編輯時段規則' : '新增時段規則'}
        size="md"
        footer={
          <>
            <button onClick={() => setShowRuleModal(false)} style={btn('#fff', '#374151', '1px solid #d1d5db')}>
              取消
            </button>
            <button
              onClick={saveRule}
              disabled={saving || selectedRulePlanIsScheduled}
              style={btn(saving || selectedRulePlanIsScheduled ? '#a78bfa' : '#7c3aed', '#fff')}
            >
              {saving ? '儲存中...' : '儲存'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Issue #1196: explain field precedence — guide rule only owns
              the time window; capacity / 最低成團 come from the activity plan
              (and can be per-date overridden in the schedule, by admin). */}
          <p style={{ margin: 0, fontSize: 12, color: '#6b7280', background: '#f9fafb', border: '1px solid #f0f0f0', borderRadius: 8, padding: '8px 10px' }}>
            這份規則只設定你「可出團的時間窗」。容量與最低成團人數來自活動方案；單日如需例外，由管理員在場次上調整。
          </p>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>活動</label>
            <select
              aria-label="活動"
              value={ruleForm.activity_id}
              onChange={(e) => setRuleForm({ ...ruleForm, activity_id: e.target.value, activity_plan_id: '' })}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14 }}
              disabled={activityPlanOptions.length === 0}
            >
              <option value="">請選擇活動</option>
              {[...new Map(activityPlanOptions.map((opt) => [opt.activityId, opt])).values()].map((activity) => (
                <option key={activity.activityId} value={activity.activityId}>{activity.activityTitle}</option>
              ))}
            </select>
            {/* Issue #1239: when the dropdown is empty, tell the guide why.
                The /api/guide/activities-with-plans endpoint only filters by
                activity.status ∈ active|published AND plan.status ∈ active|
                published — it does not gate on seasons. So "empty" almost
                always means an admin hasn't published an active plan yet. */}
            {activityPlanOptions.length === 0 && (
              <p style={{ margin: '6px 0 0', fontSize: 12, color: '#92400e', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 10px' }}>
                目前找不到可選的活動或方案。請確認你已被指派到某個「已上架」的活動,且該活動有「啟用中」的 V2 方案。如需協助請聯絡管理員。
              </p>
            )}
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>方案</label>
            <select
              aria-label="方案"
              value={ruleForm.activity_plan_id}
              onChange={(e) => {
                const newPlanId = e.target.value;
                const planOption = activityPlanOptions.find((opt) => opt.planId === newPlanId);
                // AC1: for new rules, auto-default interval to plan's durationMinutes if not manually edited
                const shouldDefaultInterval =
                  !editingRule && !intervalManuallyEdited && planOption?.durationMinutes != null;
                setRuleForm({
                  ...ruleForm,
                  activity_plan_id: newPlanId,
                  ...(shouldDefaultInterval ? { slot_interval_minutes: planOption!.durationMinutes! } : {}),
                });
              }}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14 }}
              disabled={!ruleForm.activity_id}
            >
              <option value="">請選擇方案</option>
              {selectedActivityPlans.map((plan) => (
                <option key={plan.planId} value={plan.planId}>
                  {`${plan.planName}（${bookingTypeLabelZh(plan.bookingType)}・${formatParticipants(plan.minParticipants, plan.maxParticipants)}）`}
                </option>
              ))}
            </select>
          </div>
          {selectedRulePlanIsScheduled && (
            <div
              data-testid="rule-booking-type-warning"
              style={{ border: '1px solid #fcd34d', background: '#fffbeb', borderRadius: 10, padding: '10px 12px', color: '#92400e', fontSize: 13, lineHeight: 1.6 }}
            >
              ⚠️ 此方案為<strong>排程預約</strong>，僅使用固定場次，無法設定動態可預約時段規則。請改用「場次管理」建立固定場次；動態時段規則僅適用<strong>即時／申請</strong>預約方案。
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
              <label style={{ fontSize: 13 }}><input type="radio" checked={ruleForm.rule_mode === 'weekly'} onChange={() => setRuleForm({ ...ruleForm, rule_mode: 'weekly' })} /> 每週重複</label>
              <label style={{ fontSize: 13 }}><input type="radio" checked={ruleForm.rule_mode === 'single-day'} onChange={() => setRuleForm({ ...ruleForm, rule_mode: 'single-day' })} /> 單日開放</label>
            </div>
          </div>
          {ruleForm.rule_mode === 'single-day' ? (
            <div>
              <label htmlFor="avail-single-date" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>單日日期（台灣時間）</label>
              <input id="avail-single-date" type="date" value={ruleForm.single_date} onChange={(e) => setRuleForm({ ...ruleForm, single_date: e.target.value })} style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }} />
            </div>
          ) : (
            <FormGrid cols={2}>
              <div>
                <label htmlFor="avail-start-date" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>生效起日（可空）</label>
                <input id="avail-start-date" type="date" value={ruleForm.effective_from} onChange={(e) => setRuleForm({ ...ruleForm, effective_from: e.target.value })} style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label htmlFor="avail-end-date" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>生效迄日（可空）</label>
                <input id="avail-end-date" type="date" value={ruleForm.effective_to} onChange={(e) => setRuleForm({ ...ruleForm, effective_to: e.target.value })} style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }} />
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
          <FormGrid cols={2}>
            <div>
              <label htmlFor="avail-start-time" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>開始時間</label>
              <input
                id="avail-start-time"
                type="time"
                value={ruleForm.start_time_local}
                onChange={(e) => setRuleForm({ ...ruleForm, start_time_local: e.target.value })}
                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label htmlFor="avail-end-time" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>結束時間</label>
              <input
                id="avail-end-time"
                type="time"
                value={ruleForm.end_time_local}
                onChange={(e) => setRuleForm({ ...ruleForm, end_time_local: e.target.value })}
                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }}
              />
            </div>
          </FormGrid>
          <FormGrid cols={2}>
            <div>
              <label htmlFor="avail-interval-minutes" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>時段間隔 (分鐘)</label>
              <input
                id="avail-interval-minutes"
                type="number"
                min="15"
                step="15"
                value={ruleForm.slot_interval_minutes}
                onChange={(e) => {
                  setIntervalManuallyEdited(true); // AC1: guide manually set interval — do not auto-override on plan switch
                  setRuleForm({ ...ruleForm, slot_interval_minutes: Number(e.target.value) });
                }}
                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label htmlFor="avail-buffer-minutes" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>緩衝時間 (分鐘)</label>
              <input
                id="avail-buffer-minutes"
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
          {/* AC2: existing-rule mismatch warning */}
          {editingRule && selectedRulePlan?.durationMinutes != null &&
            ruleForm.slot_interval_minutes !== selectedRulePlan.durationMinutes && (
            <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', color: '#92400e', fontSize: 13 }}>
              ⚠️ 注意：目前設定的時段間隔（{ruleForm.slot_interval_minutes} 分鐘）與方案時長（{selectedRulePlan.durationMinutes} 分鐘）不一致。若要對齊方案時長，請手動更新間隔。
            </div>
          )}
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
        </div>
      </ResponsiveModal>

      {/* ── Blackout Modal ── same a11y story as the rule modal above. */}
      <ResponsiveModal
        open={showBlackoutModal}
        onClose={() => setShowBlackoutModal(false)}
        title={editingBlackout ? '編輯休假時段' : '新增休假時段'}
        size="sm"
        footer={
          <>
            <button onClick={() => setShowBlackoutModal(false)} style={btn('#fff', '#374151', '1px solid #d1d5db')}>
              取消
            </button>
            <button onClick={saveBlackout} disabled={saving} style={btn(saving ? '#a78bfa' : '#7c3aed', '#fff')}>
              {saving ? '儲存中...' : (editingBlackout ? '更新' : '儲存')}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label htmlFor="avail-blackout-starts-at" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>開始時間</label>
            <input
              id="avail-blackout-starts-at"
              type="datetime-local"
              value={blackoutForm.starts_at}
              onChange={(e) => setBlackoutForm({ ...blackoutForm, starts_at: e.target.value })}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label htmlFor="avail-blackout-ends-at" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>結束時間</label>
            <input
              id="avail-blackout-ends-at"
              type="datetime-local"
              value={blackoutForm.ends_at}
              onChange={(e) => setBlackoutForm({ ...blackoutForm, ends_at: e.target.value })}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label htmlFor="avail-blackout-reason" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>原因 (選填)</label>
            <input
              id="avail-blackout-reason"
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
        </div>
      </ResponsiveModal>

      {/* ── Availability Precedence Helper ── */}
      <div
        data-testid="guide-availability-precedence-helper"
        style={{
          marginBottom: 20,
          padding: '12px 16px',
          borderRadius: 10,
          border: '1px solid #e5e7eb',
          background: '#f9fafb',
          fontSize: 12,
          color: '#374151',
          lineHeight: 1.8,
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 13 }}>可預約狀態優先順序說明：</span>
        <span style={{ marginLeft: 6 }}>
          方案狀態（未啟用）&gt; 開放季節（季節外）&gt; 時段規則（規則外）&gt; 黑名單/衝突（封鎖）&gt; 可預約
        </span>
        <div style={{ marginTop: 4, color: '#6b7280' }}>
          最高優先：若方案狀態為「未啟用」，無論其他設定，此方案所有時段均不開放。依序往下，季節設定、時段規則、黑名單/衝突才會生效。
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {loading ? (
          <div style={{ ...cardStyle, padding: 40, textAlign: 'center', color: '#9ca3af' }}>載入中...</div>
        ) : (
          <>
            {/* ── Weekly Rules ── */}
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

            {/* ── Blackout Dates ── */}
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

            {/* ── Slot Preview ── */}
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
          </>
        )}
      </div>
    </div>
  );
}
