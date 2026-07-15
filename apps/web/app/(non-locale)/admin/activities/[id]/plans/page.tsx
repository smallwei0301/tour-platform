'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { csrfHeaders } from '../../../../../../src/lib/csrf-client';
import { Card, PageHeader, Badge } from '../../../../../../src/components/admin/ui';
import { ResponsiveTable, type ResponsiveColumn } from '../../../../../../src/components/admin/responsive';
import { useTablistKeyboard } from '../../../../../../src/lib/use-tablist-keyboard';
// #1615 第二批拆檔：方案表單 Modal／開放季節面板／共用型別與純函式拆至 activity-plans/，
// 純結構搬移、零行為變更；跨區塊狀態仍在本頁（lift state）以 props 傳遞。
import { PlanFormModal } from '../../../../../../src/components/admin/activity-plans/PlanFormModal';
import { PlanSeasonsPanel } from '../../../../../../src/components/admin/activity-plans/PlanSeasonsPanel';
import { btn, smallBtn } from '../../../../../../src/components/admin/activity-plans/button-styles';
import {
  createDefaultForm,
  createDefaultSeasonForm,
  seasonToForm,
  listToTextarea,
  itineraryToForm,
  itineraryForPayload,
  parseLineList,
  type Activity,
  type ActivityPlan,
  type ActivityPlanSeason,
  type ReadinessCheck,
  type SeasonFormState,
} from '../../../../../../src/components/admin/activity-plans/plan-types';

const PLAN_STATUS_TABS = [
  { value: '', label: '全部' },
  { value: 'active', label: '啟用中' },
  { value: 'inactive', label: '已停用' },
  { value: 'archived', label: '已封存' },
] as const;
const PLAN_STATUS_VALUES = PLAN_STATUS_TABS.map((t) => t.value);

const PRICE_TYPE_LABELS: Record<string, string> = {
  per_person: '每人',
  per_group: '每團',
};

const BOOKING_TYPE_LABELS: Record<string, string> = {
  scheduled: '排程預約',
  request: '申請預約',
  instant: '即時預約',
};

const STATUS_CONFIG: Record<string, { variant: 'success' | 'warning' | 'default'; label: string }> = {
  active: { variant: 'success', label: '啟用' },
  inactive: { variant: 'warning', label: '停用' },
  archived: { variant: 'default', label: '已封存' },
};

export default function ActivityPlansPage() {
  const params = useParams();
  const router = useRouter();
  // Route is /admin/activities/[id]/plans
  const activityId = (params.id || params.activityId) as string;

  const [activity, setActivity] = useState<Activity | null>(null);
  const [plans, setPlans] = useState<ActivityPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<ActivityPlan | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const tabKb = useTablistKeyboard(PLAN_STATUS_VALUES, statusFilter, setStatusFilter);

  const [readinessCheck, setReadinessCheck] = useState<ReadinessCheck | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [seasonPanelPlanId, setSeasonPanelPlanId] = useState<string | null>(null);
  const [seasonPanelPlanName, setSeasonPanelPlanName] = useState('');
  const [seasons, setSeasons] = useState<ActivityPlanSeason[]>([]);
  const [seasonLoading, setSeasonLoading] = useState(false);
  const [seasonError, setSeasonError] = useState('');
  const [seasonNotice, setSeasonNotice] = useState('');
  const [showSeasonForm, setShowSeasonForm] = useState(false);
  const [seasonSaving, setSeasonSaving] = useState(false);
  const [editingSeason, setEditingSeason] = useState<ActivityPlanSeason | null>(null);
  const [seasonForm, setSeasonForm] = useState<SeasonFormState>(createDefaultSeasonForm());
  const [yearRoundSaving, setYearRoundSaving] = useState(false);

  const [form, setForm] = useState(createDefaultForm());

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v2/admin/activities/${activityId}/plans`);
      const json = await res.json();
      if (json.success) {
        setActivity(json.data.activity);
        setPlans(json.data.plans || []);
        setError('');
      } else {
        setError(json.error?.message || '載入方案失敗，請重新整理後再試。');
      }
    } catch {
      setError('載入方案失敗，請檢查網路或稍後再試。');
    } finally {
      setLoading(false);
    }
  }, [activityId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!activityId) return;
    setReadinessLoading(true);
    fetch(`/api/v2/admin/activities/${activityId}/readiness`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.data) setReadinessCheck(d.data as ReadinessCheck);
      })
      .catch(() => {})
      .finally(() => setReadinessLoading(false));
  }, [activityId]);

  useEffect(() => {
    if (!seasonPanelPlanId) return;
    const selectedPlan = plans.find((plan) => plan.id === seasonPanelPlanId);
    if (selectedPlan) {
      setSeasonPanelPlanName(selectedPlan.name);
    }
  }, [plans, seasonPanelPlanId]);

  const openModal = (plan?: ActivityPlan) => {
    if (plan) {
      setEditingPlan(plan);
      setForm({
        ...createDefaultForm(),
        name: plan.name,
        description: plan.description || '',
        duration_minutes: plan.duration_minutes,
        price_type: plan.price_type,
        base_price: plan.base_price,
        min_participants: plan.min_participants,
        max_participants: plan.max_participants,
        booking_type: plan.booking_type,
        status: plan.status,
        details_link_text: plan.details_link_text || '',
        booking_btn_text: plan.booking_btn_text || '',
        highlights: listToTextarea(plan.highlights),
        language: plan.language || '',
        earliest_departure: plan.earliest_departure || '',
        confirm_by_days: plan.confirm_by_days == null ? '' : String(plan.confirm_by_days),
        free_cancel_days: plan.free_cancel_days == null ? '' : String(plan.free_cancel_days),
        plan_inclusions: listToTextarea(plan.plan_inclusions),
        plan_exclusions: listToTextarea(plan.plan_exclusions),
        plan_itinerary: itineraryToForm(plan.plan_itinerary),
        meeting_point_name: plan.meeting_point_name || '',
        meeting_address: plan.meeting_address || '',
        experience_point_name: plan.experience_point_name || '',
        experience_address: plan.experience_address || '',
        plan_notices: listToTextarea(plan.plan_notices),
        plan_refund_rules: listToTextarea(plan.plan_refund_rules),
      });
    } else {
      setEditingPlan(null);
      setForm(createDefaultForm());
    }
    setError('');
    setShowModal(true);
  };

  const savePlan = async () => {
    if (!form.name.trim()) {
      setError('請輸入方案名稱');
      return;
    }
    if (form.duration_minutes < 15) {
      setError('時長至少 15 分鐘');
      return;
    }
    if (form.base_price < 0) {
      setError('價格不能為負數');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const url = editingPlan
        ? `/api/v2/admin/activities/${activityId}/plans/${editingPlan.id}`
        : `/api/v2/admin/activities/${activityId}/plans`;
      const method = editingPlan ? 'PUT' : 'POST';

      const payload = {
        ...form,
        highlights: parseLineList(form.highlights),
        plan_inclusions: parseLineList(form.plan_inclusions),
        plan_exclusions: parseLineList(form.plan_exclusions),
        plan_itinerary: itineraryForPayload(form.plan_itinerary),
        plan_notices: parseLineList(form.plan_notices),
        plan_refund_rules: parseLineList(form.plan_refund_rules),
        confirm_by_days: form.confirm_by_days === '' ? undefined : Number(form.confirm_by_days),
        free_cancel_days: form.free_cancel_days === '' ? undefined : Number(form.free_cancel_days),
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (json.success) {
        const dropped: string[] = Array.isArray(json.data?.droppedColumns) ? json.data.droppedColumns : [];
        if (dropped.length > 0) {
          setNotice(`方案已儲存，但下列 ${dropped.length} 個進階欄位因資料庫 schema 未升級暫未保存：${dropped.join('、')}。請聯絡技術人員套用最新 migration。`);
        } else {
          setNotice('');
        }
        setShowModal(false);
        await loadData();
      } else {
        setError(json.error?.message || '儲存失敗');
      }
    } finally {
      setSaving(false);
    }
  };

  const archivePlan = async (planId: string) => {
    if (!confirm('確定要封存此方案嗎？封存後旅客將無法預約此方案。')) return;

    try {
      const res = await fetch(`/api/v2/admin/activities/${activityId}/plans/${planId}`, {
        method: 'DELETE',
        headers: csrfHeaders(),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error?.message || '封存方案失敗，請稍後再試。');
        return;
      }
      setError('');
      await loadData();
    } catch {
      setError('封存方案失敗，請檢查網路或稍後再試。');
    }
  };

  const loadPlanSeasons = useCallback(
    async (planId: string) => {
      setSeasonLoading(true);
      try {
        const res = await fetch(`/api/v2/admin/activities/${activityId}/plans/${planId}/seasons`);
        const json = await res.json();
        if (!json.success) {
          setSeasonError(json.error?.message || '載入開放季節失敗，請稍後再試。');
          return;
        }
        setSeasons(Array.isArray(json.data?.seasons) ? json.data.seasons : []);
        setSeasonError('');
      } catch {
        setSeasonError('載入開放季節失敗，請檢查網路或稍後再試。');
      } finally {
        setSeasonLoading(false);
      }
    },
    [activityId]
  );

  const openSeasonManager = async (plan: ActivityPlan) => {
    setSeasonPanelPlanId(plan.id);
    setSeasonPanelPlanName(plan.name);
    setSeasonNotice('');
    setShowSeasonForm(false);
    setEditingSeason(null);
    setSeasonForm(createDefaultSeasonForm());
    await loadPlanSeasons(plan.id);
  };

  const openSeasonForm = (season?: ActivityPlanSeason) => {
    setEditingSeason(season || null);
    setSeasonForm(season ? seasonToForm(season) : createDefaultSeasonForm());
    setSeasonError('');
    setSeasonNotice('');
    setShowSeasonForm(true);
  };

  const closeSeasonForm = () => {
    setEditingSeason(null);
    setSeasonForm(createDefaultSeasonForm());
    setShowSeasonForm(false);
  };

  const saveSeason = async () => {
    if (!seasonPanelPlanId) return;
    if (!seasonForm.name.trim()) {
      setSeasonError('請輸入季節名稱');
      return;
    }

    setSeasonSaving(true);
    setSeasonError('');

    try {
      const payload = {
        name: seasonForm.name.trim(),
        start_month: Number(seasonForm.start_month),
        start_day: Number(seasonForm.start_day),
        end_month: Number(seasonForm.end_month),
        end_day: Number(seasonForm.end_day),
        timezone: seasonForm.timezone.trim() || 'Asia/Taipei',
      };

      const url = editingSeason
        ? `/api/v2/admin/activities/${activityId}/plans/${seasonPanelPlanId}/seasons/${editingSeason.id}`
        : `/api/v2/admin/activities/${activityId}/plans/${seasonPanelPlanId}/seasons`;
      const method = editingSeason ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (!json.success) {
        setSeasonError(json.error?.message || '儲存季節失敗，請稍後再試。');
        return;
      }

      setSeasonNotice(editingSeason ? '季節已更新。' : '季節已建立。');
      closeSeasonForm();
      await loadPlanSeasons(seasonPanelPlanId);
    } catch {
      setSeasonError('儲存季節失敗，請檢查網路或稍後再試。');
    } finally {
      setSeasonSaving(false);
    }
  };

  const disableSeason = async (season: ActivityPlanSeason) => {
    if (!seasonPanelPlanId) return;
    if (!confirm(`確定要停用季節「${season.name}」嗎？`)) return;

    try {
      const res = await fetch(
        `/api/v2/admin/activities/${activityId}/plans/${seasonPanelPlanId}/seasons/${season.id}`,
        {
          method: 'DELETE',
          headers: csrfHeaders(),
        }
      );
      const json = await res.json();

      if (!json.success) {
        setSeasonError(json.error?.message || '停用季節失敗，請稍後再試。');
        return;
      }

      setSeasonNotice(`已停用「${season.name}」`);
      setSeasonError('');
      await loadPlanSeasons(seasonPanelPlanId);
    } catch {
      setSeasonError('停用季節失敗，請檢查網路或稍後再試。');
    }
  };

  const toggleYearRound = async (next: boolean) => {
    if (!seasonPanelPlanId) return;

    setYearRoundSaving(true);
    setSeasonError('');
    setSeasonNotice('');

    try {
      const res = await fetch(`/api/v2/admin/activities/${activityId}/plans/${seasonPanelPlanId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ is_year_round: next }),
      });
      const json = await res.json();

      if (!json.success) {
        setSeasonError(json.error?.message || '更新全年開放設定失敗，請稍後再試。');
        return;
      }

      setSeasonNotice(next ? '已設定為全年開放。' : '已關閉全年開放，改由下方季節區間決定可販售期間。');
      await loadData();
    } catch {
      setSeasonError('更新全年開放設定失敗，請檢查網路或稍後再試。');
    } finally {
      setYearRoundSaving(false);
    }
  };

  const toggleStatus = async (plan: ActivityPlan) => {
    const newStatus = plan.status === 'active' ? 'inactive' : 'active';

    try {
      const res = await fetch(`/api/v2/admin/activities/${activityId}/plans/${plan.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error?.message || '更新方案狀態失敗，請稍後再試。');
        return;
      }
      setError('');
      await loadData();
    } catch {
      setError('更新方案狀態失敗，請檢查網路或稍後再試。');
    }
  };

  const filteredPlans = statusFilter
    ? plans.filter((p) => p.status === statusFilter)
    : plans;
  const hasActiveSeasons = seasons.some((season) => season.is_active);
  const seasonPanelPlan = seasonPanelPlanId ? plans.find((plan) => plan.id === seasonPanelPlanId) : undefined;
  const isYearRound = Boolean(seasonPanelPlan?.is_year_round);

  return (
    <div style={{ background: '#f9fafb', minHeight: '100vh' }}>
      <PageHeader
        title="方案管理"
        subtitle={activity ? `${activity.title} - 管理此行程的可預約方案` : '載入中...'}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => router.push(`/admin/activities/${activityId}/edit`)} style={btn('#fff', '#374151', '1px solid #d1d5db')}>
              ← 返回行程編輯
            </button>
            <button onClick={() => openModal()} style={btn('#16a34a', '#fff')}>
              + 新增方案
            </button>
          </div>
        }
      />

      {/* ── Readiness gate widget ── */}
      {readinessLoading ? (
        <div style={{ padding: '12px 16px', background: '#f9fafb', borderRadius: 8, marginBottom: 16, fontSize: 13, color: '#6b7280' }}>
          ⏳ 檢查發佈資格中⋯
        </div>
      ) : readinessCheck && !readinessCheck.readinessOk ? (
        <div
          data-testid="readiness-blockers"
          style={{ padding: '12px 16px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, marginBottom: 16 }}
        >
          <p style={{ fontWeight: 600, color: '#b45309', margin: '0 0 8px', fontSize: 13 }}>
            ⚠️ 此行程尚未符合發佈條件（{readinessCheck.blockers.length} 個問題）
          </p>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: '#92400e' }}>
            {readinessCheck.blockers.map((b, i) => (
              <li key={i}>{b.messageZh}</li>
            ))}
          </ul>
        </div>
      ) : readinessCheck && readinessCheck.readinessOk && readinessCheck.warnings.length > 0 ? (
        <div
          data-testid="readiness-warnings"
          style={{ padding: '12px 16px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, marginBottom: 16 }}
        >
          <p style={{ fontWeight: 600, color: '#92400e', margin: '0 0 4px', fontSize: 13 }}>
            ℹ️ 注意（非阻擋警告）
          </p>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: '#78350f' }}>
            {readinessCheck.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      ) : readinessCheck && readinessCheck.readinessOk ? (
        <div
          data-testid="readiness-ok"
          style={{ padding: '8px 16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, marginBottom: 16, fontSize: 13, color: '#15803d' }}
        >
          ✅ 符合發佈條件（{readinessCheck.summary.activePlansCount} 個啟用方案，{readinessCheck.summary.futureSchedulesCount} 個未來場次）
        </div>
      ) : null}

      {/* ── Modal ── */}
      <PlanFormModal
        showModal={showModal}
        setShowModal={setShowModal}
        editingPlan={editingPlan}
        form={form}
        setForm={setForm}
        saving={saving}
        error={error}
        savePlan={savePlan}
        activityId={activityId}
      />

      <div className="admin-page">
        {/* Status Filter */}
        <div role="tablist" aria-label="方案狀態篩選" style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid #f0f0f0', paddingBottom: 0, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {PLAN_STATUS_TABS.map((tab, i) => (
            <button
              key={tab.value}
              ref={tabKb.registerTab(i)}
              role="tab"
              aria-selected={statusFilter === tab.value}
              onClick={() => setStatusFilter(tab.value)}
              onKeyDown={tabKb.onKeyDown}
              style={{
                padding: '10px 18px',
                border: 'none',
                background: 'none',
                fontWeight: statusFilter === tab.value ? 700 : 400,
                fontSize: 14,
                cursor: 'pointer',
                borderBottom: statusFilter === tab.value ? '2px solid var(--tp-primary, #16a34a)' : '2px solid transparent',
                color: statusFilter === tab.value ? 'var(--tp-primary, #16a34a)' : '#666',
                marginBottom: -2,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {error && (
          <div
            role="alert"
            aria-live="polite"
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 10,
              padding: '10px 14px',
              color: '#b91c1c',
              fontSize: 14,
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}

        {notice && (
          <div
            role="status"
            aria-live="polite"
            style={{
              background: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: 10,
              padding: '10px 14px',
              color: '#92400e',
              fontSize: 14,
              marginBottom: 16,
            }}
          >
            {notice}
          </div>
        )}

        <Card>
          <ResponsiveTable
            columns={[
              {
                key: 'name', header: '方案名稱', mobilePriority: 'title',
                cell: (plan: ActivityPlan) => (
                  <>
                    <div style={{ fontWeight: 600 }}>{plan.name}</div>
                    {plan.description && (
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                        {plan.description.length > 50 ? plan.description.slice(0, 50) + '...' : plan.description}
                      </div>
                    )}
                  </>
                ),
              },
              {
                key: 'status', header: '狀態', mobilePriority: 'subtitle',
                cell: (plan: ActivityPlan) => {
                  const cfg = STATUS_CONFIG[plan.status] || { variant: 'default', label: plan.status };
                  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
                },
              },
              { key: 'duration', header: '時長', mobileLabel: '時長', cell: (plan: ActivityPlan) => `${plan.duration_minutes} 分鐘` },
              {
                key: 'price', header: '價格', mobileLabel: '價格',
                cell: (plan: ActivityPlan) => `NT$${plan.base_price.toLocaleString()} / ${PRICE_TYPE_LABELS[plan.price_type]}`,
              },
              { key: 'people', header: '人數', mobileLabel: '人數', cell: (plan: ActivityPlan) => `${plan.min_participants}-${plan.max_participants} 人` },
              { key: 'booking', header: '預約方式', mobileLabel: '預約', cell: (plan: ActivityPlan) => BOOKING_TYPE_LABELS[plan.booking_type] },
              {
                key: 'actions', header: '操作', mobileLabel: '操作',
                cell: (plan: ActivityPlan) => (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button onClick={() => openModal(plan)} style={smallBtn('#f0f0f0', '#333')}>編輯</button>
                    <button onClick={() => void openSeasonManager(plan)} style={smallBtn(seasonPanelPlanId === plan.id ? '#dbeafe' : '#eef2ff', seasonPanelPlanId === plan.id ? '#1d4ed8' : '#3730a3')}>
                      開放季節
                    </button>
                    {plan.status !== 'archived' && (
                      <button onClick={() => toggleStatus(plan)} style={smallBtn(plan.status === 'active' ? '#fef9c3' : '#dcfce7', plan.status === 'active' ? '#854d0e' : '#166534')}>
                        {plan.status === 'active' ? '停用' : '啟用'}
                      </button>
                    )}
                    {plan.status !== 'archived' && (
                      <button onClick={() => archivePlan(plan.id)} style={smallBtn('#fee2e2', '#991b1b')}>封存</button>
                    )}
                  </div>
                ),
              },
            ] as ResponsiveColumn<ActivityPlan>[]}
            rows={filteredPlans}
            getRowKey={(p: ActivityPlan) => p.id}
            loading={loading}
            emptyMessage={statusFilter ? `沒有${STATUS_CONFIG[statusFilter]?.label || ''}方案` : '尚無方案，點擊「新增方案」建立第一個'}
          />
        </Card>

        {seasonPanelPlanId && (
          <PlanSeasonsPanel
            seasonPanelPlanName={seasonPanelPlanName}
            seasons={seasons}
            seasonLoading={seasonLoading}
            seasonError={seasonError}
            seasonNotice={seasonNotice}
            showSeasonForm={showSeasonForm}
            editingSeason={editingSeason}
            seasonForm={seasonForm}
            setSeasonForm={setSeasonForm}
            seasonSaving={seasonSaving}
            yearRoundSaving={yearRoundSaving}
            isYearRound={isYearRound}
            hasActiveSeasons={hasActiveSeasons}
            openSeasonForm={openSeasonForm}
            closeSeasonForm={closeSeasonForm}
            saveSeason={saveSeason}
            disableSeason={disableSeason}
            toggleYearRound={toggleYearRound}
          />
        )}
      </div>
    </div>
  );
}
