'use client';

// #1615 第一批：本頁原為 1,221 行 god-page，已拆解為「頁面＝狀態＋handler＋組裝」，
// 共用/專屬 UI 區塊移至 src/components/availability/**（純結構搬移、零行為變更）。

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { csrfHeaders } from '../../../../../../src/lib/csrf-client';
import { Card, PageHeader, LoadingSkeleton } from '../../../../../../src/components/admin/ui';
import { ResponsiveModal } from '../../../../../../src/components/admin/responsive';
import {
  describePlanSeasonStatus,
  describePreviewReason,
  describeRuleSeasonConflict,
  type UiActiveSeasonSummary,
} from '../../../../../../src/lib/availability-v2/canonical-availability-ui';
import { bookingTypeLabelZh, isDynamicAvailabilityApplicable } from '../../../../../../src/lib/booking-type-flow.mjs';
import {
  btn,
  formatParticipants,
  type BlackoutDate,
} from '../../../../../../src/components/availability/shared';
import {
  RuleSeasonNotices,
  RuleScheduleFields,
  RuleActivationToggles,
  FormErrorNote,
} from '../../../../../../src/components/availability/rule-form-fields';
import { BlackoutFields } from '../../../../../../src/components/availability/blackout-form-fields';
import {
  AdminWeeklyRulesSection,
  AdminBlackoutSection,
  AdminSlotPreviewSection,
  type AvailabilityRule,
  type PreviewSlot,
  type Guide,
  type V2Activity,
  type V2Plan,
} from '../../../../../../src/components/availability/admin-sections';
import {
  AdminConflictOverrideModalBody,
  DEFAULT_CONFLICT_OVERRIDE_FORM,
  toConflictOverrideSnapshot,
  type ConflictOverrideForm,
} from '../../../../../../src/components/availability/admin-conflict-override-modal';

// input id 常數：沿用既有 label htmlFor／input id 關聯，供共用表單元件注入。
// buffer 沿用歷史 id「avail-buffer-time」（GH-1093 鎖定），刻意無 admin- 前綴。
const ADMIN_RULE_FIELD_IDS = {
  singleDate: 'admin-avail-single-date',
  startDate: 'admin-avail-start-date',
  endDate: 'admin-avail-end-date',
  startTime: 'admin-avail-start-time',
  endTime: 'admin-avail-end-time',
  interval: 'admin-avail-interval-minutes',
  buffer: 'avail-buffer-time',
};

const ADMIN_BLACKOUT_FIELD_IDS = {
  startsAt: 'admin-avail-blackout-starts-at',
  endsAt: 'admin-avail-blackout-ends-at',
  reason: 'admin-avail-blackout-reason',
};

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
  const [previewNotice, setPreviewNotice] = useState<string | null>(null);
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
        setPreviewNotice(json.data.previewNotice || null);
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
    // 排程方案不得綁動態規則（後端亦回 422，前端先擋一層）。
    if (selectedRulePlanIsScheduled) {
      setError('排程預約方案僅使用固定場次，請改用「場次管理」。');
      return;
    }
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

  // ── 衍生資料（供 Modal 與各區塊子元件使用） ──
  const activityByPlanId = Object.fromEntries(v2Activities.flatMap((activity) => activity.plans.map((plan) => [plan.id, activity]))) as Record<string, V2Activity>;
  const planById = Object.fromEntries(v2Activities.flatMap((activity) => activity.plans.map((plan) => [plan.id, plan]))) as Record<string, V2Plan>;
  const selectedRulePlan = ruleForm.activity_plan_id ? planById[ruleForm.activity_plan_id] : null;
  // 排程方案只看固定場次，動態可預約時段規則對它無效（對稱 #1495）。
  const selectedRulePlanIsScheduled = Boolean(
    selectedRulePlan && !isDynamicAvailabilityApplicable(selectedRulePlan.booking_type)
  );
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
  const previewPlanSeasonStatus = describePlanSeasonStatus({
    isYearRound: previewPlanId ? previewPlan?.isYearRound : previewIsYearRound,
    activeSeasonSummaries: previewPlanId ? previewPlan?.activeSeasonSummaries : previewActiveSeasonSummaries,
  });
  const previewReason = describePreviewReason({ previewCanonicalState, previewSeasonGate });

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
                        {`${p.name}（${bookingTypeLabelZh(p.booking_type)}・${formatParticipants(p.minParticipants, p.maxParticipants)}）`}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <RuleSeasonNotices
                selectedRulePlanIsScheduled={selectedRulePlanIsScheduled}
                hasSelectedRulePlan={Boolean(selectedRulePlan)}
                rulePlanSeasonStatus={rulePlanSeasonStatus}
                ruleSeasonConflict={ruleSeasonConflict}
              />
              <RuleScheduleFields
                ruleForm={ruleForm}
                ids={ADMIN_RULE_FIELD_IDS}
                onModeChange={(mode) =>
                  setRuleForm(mode === 'weekly'
                    ? { ...ruleForm, rule_mode: 'weekly', single_date: '' }
                    : { ...ruleForm, rule_mode: 'single-day' })
                }
                onPatch={(patch) => setRuleForm({ ...ruleForm, ...patch })}
                onIntervalChange={(value) => setRuleForm({ ...ruleForm, slot_interval_minutes: value })}
              />
              <RuleActivationToggles
                ruleForm={ruleForm}
                onPatch={(patch) => setRuleForm({ ...ruleForm, ...patch })}
              />
              <FormErrorNote error={error} />
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <button
                  onClick={saveRule}
                  disabled={saving || selectedRulePlanIsScheduled}
                  style={btn(saving || selectedRulePlanIsScheduled ? '#a78bfa' : '#7c3aed', '#fff')}
                >
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
              <BlackoutFields
                blackoutForm={blackoutForm}
                ids={ADMIN_BLACKOUT_FIELD_IDS}
                onPatch={(patch) => setBlackoutForm({ ...blackoutForm, ...patch })}
              />
              <FormErrorNote error={error} />
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
        <AdminConflictOverrideModalBody
          guide={guide}
          previewActivity={previewActivity}
          previewPlan={previewPlan}
          selectedConflictSlot={selectedConflictSlot}
          conflictOverrideForm={conflictOverrideForm}
          setConflictOverrideForm={setConflictOverrideForm}
          conflictOverrideError={conflictOverrideError}
          conflictOverrideSaving={conflictOverrideSaving}
          saveConflictOverride={saveConflictOverride}
          onCancel={() => setShowConflictOverrideModal(false)}
        />
      </ResponsiveModal>

      <div className="admin-page" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {loading ? (
          <Card>
            <LoadingSkeleton />
          </Card>
        ) : (
          <>
            <AdminWeeklyRulesSection
              rules={rules}
              activityByPlanId={activityByPlanId}
              planById={planById}
              openRuleModal={openRuleModal}
              deleteRule={deleteRule}
            />
            <AdminBlackoutSection
              blackouts={blackouts}
              openBlackoutModal={openBlackoutModal}
              deleteBlackout={deleteBlackout}
            />
            <AdminSlotPreviewSection
              v2Activities={v2Activities}
              previewPlanId={previewPlanId}
              setPreviewPlanId={setPreviewPlanId}
              previewDateFrom={previewDateFrom}
              setPreviewDateFrom={setPreviewDateFrom}
              previewDateTo={previewDateTo}
              setPreviewDateTo={setPreviewDateTo}
              loadPreview={loadPreview}
              previewLoading={previewLoading}
              previewNotice={previewNotice}
              previewPlanSeasonStatus={previewPlanSeasonStatus}
              previewReason={previewReason}
              previewCanonicalState={previewCanonicalState}
              previewSeasonGate={previewSeasonGate}
              previewSlots={previewSlots}
              previewActivity={previewActivity}
              previewPlan={previewPlan}
              openConflictOverrideModal={openConflictOverrideModal}
            />
          </>
        )}
      </div>
    </div>
  );
}
