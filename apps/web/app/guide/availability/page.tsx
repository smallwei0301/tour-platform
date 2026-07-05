'use client';

// #1615 第一批：本頁原為 1,218 行 god-page，已拆解為「頁面＝狀態＋handler＋組裝」，
// 共用/專屬 UI 區塊移至 src/components/availability/**（純結構搬移、零行為變更）。

import { useEffect, useState, useCallback } from 'react';
import { csrfHeaders } from '../../../src/lib/csrf-client';
import { ResponsiveModal, useIsMobile } from '../../../src/components/admin/responsive';
import {
  describePlanSeasonStatus,
  describePreviewReason,
  describeRuleSeasonConflict,
  type UiActiveSeasonSummary,
} from '../../../src/lib/availability-v2/canonical-availability-ui';
import { bookingTypeLabelZh, isDynamicAvailabilityApplicable } from '../../../src/lib/booking-type-flow.mjs';
import {
  toHhMm,
  btn,
  cardStyle,
  formatParticipants,
  type BlackoutDate,
} from '../../../src/components/availability/shared';
import {
  RuleSeasonNotices,
  RuleScheduleFields,
  RuleActivationToggles,
  FormErrorNote,
} from '../../../src/components/availability/rule-form-fields';
import { BlackoutFields } from '../../../src/components/availability/blackout-form-fields';
import {
  GuideWeeklyRulesSection,
  GuideBlackoutSection,
  GuideSlotPreviewSection,
  type AvailabilityRule,
  type PreviewSlot,
  type PreviewSource,
  type PreviewReasonCode,
  type GuideActivityPlanOption,
} from '../../../src/components/availability/guide-sections';

// input id 常數：沿用既有 label htmlFor／input id 關聯（PR #1063），
// 供共用表單元件注入，e2e 與 a11y 選擇器不變。
const GUIDE_RULE_FIELD_IDS = {
  singleDate: 'avail-single-date',
  startDate: 'avail-start-date',
  endDate: 'avail-end-date',
  startTime: 'avail-start-time',
  endTime: 'avail-end-time',
  interval: 'avail-interval-minutes',
  buffer: 'avail-buffer-minutes',
};

const GUIDE_BLACKOUT_FIELD_IDS = {
  startsAt: 'avail-blackout-starts-at',
  endsAt: 'avail-blackout-ends-at',
  reason: 'avail-blackout-reason',
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

  // ── 衍生資料（供 Modal 與各區塊子元件使用） ──
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
          <RuleSeasonNotices
            selectedRulePlanIsScheduled={selectedRulePlanIsScheduled}
            hasSelectedRulePlan={Boolean(selectedRulePlan)}
            rulePlanSeasonStatus={rulePlanSeasonStatus}
            ruleSeasonConflict={ruleSeasonConflict}
          />
          <RuleScheduleFields
            ruleForm={ruleForm}
            ids={GUIDE_RULE_FIELD_IDS}
            onModeChange={(mode) => setRuleForm({ ...ruleForm, rule_mode: mode })}
            onPatch={(patch) => setRuleForm({ ...ruleForm, ...patch })}
            onIntervalChange={(value) => {
              setIntervalManuallyEdited(true); // AC1: guide manually set interval — do not auto-override on plan switch
              setRuleForm({ ...ruleForm, slot_interval_minutes: value });
            }}
          />
          {/* AC2: existing-rule mismatch warning */}
          {editingRule && selectedRulePlan?.durationMinutes != null &&
            ruleForm.slot_interval_minutes !== selectedRulePlan.durationMinutes && (
            <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', color: '#92400e', fontSize: 13 }}>
              ⚠️ 注意：目前設定的時段間隔（{ruleForm.slot_interval_minutes} 分鐘）與方案時長（{selectedRulePlan.durationMinutes} 分鐘）不一致。若要對齊方案時長，請手動更新間隔。
            </div>
          )}
          <RuleActivationToggles
            ruleForm={ruleForm}
            onPatch={(patch) => setRuleForm({ ...ruleForm, ...patch })}
          />
          <FormErrorNote error={error} />
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
          <BlackoutFields
            blackoutForm={blackoutForm}
            ids={GUIDE_BLACKOUT_FIELD_IDS}
            onPatch={(patch) => setBlackoutForm({ ...blackoutForm, ...patch })}
          />
          <FormErrorNote error={error} />
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
            <GuideWeeklyRulesSection
              isMobile={isMobile}
              rules={rules}
              optionByPlanId={optionByPlanId}
              openRuleModal={openRuleModal}
              deleteRule={deleteRule}
            />
            <GuideBlackoutSection
              blackouts={blackouts}
              openBlackoutModal={openBlackoutModal}
              deleteBlackout={deleteBlackout}
            />
            <GuideSlotPreviewSection
              isMobile={isMobile}
              rules={rules}
              activityPlanOptions={activityPlanOptions}
              previewPlanId={previewPlanId}
              setPreviewPlanId={setPreviewPlanId}
              previewDateFrom={previewDateFrom}
              setPreviewDateFrom={setPreviewDateFrom}
              previewDateTo={previewDateTo}
              setPreviewDateTo={setPreviewDateTo}
              loadPreview={loadPreview}
              previewLoading={previewLoading}
              previewError={previewError}
              previewSource={previewSource}
              previewReasonCode={previewReasonCode}
              previewCanonicalState={previewCanonicalState}
              previewSeasonGate={previewSeasonGate}
              previewNotice={previewNotice}
              previewPlan={previewPlan}
              previewPlanSeasonStatus={previewPlanSeasonStatus}
              previewReason={previewReason}
              previewSlots={previewSlots}
            />
          </>
        )}
      </div>
    </div>
  );
}
