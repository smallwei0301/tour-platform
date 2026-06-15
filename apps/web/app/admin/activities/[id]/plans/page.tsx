'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { csrfHeaders } from '../../../../../src/lib/csrf-client';
import { Card, PageHeader, Badge } from '../../../../../src/components/admin/ui';
import { ResponsiveModal, ResponsiveTable, FormGrid, type ResponsiveColumn } from '../../../../../src/components/admin/responsive';
import { useTablistKeyboard } from '../../../../../src/lib/use-tablist-keyboard';
import { ImageUpload } from '../../../../../src/components/admin/ImageUpload';

// #297 方案詳情「行程介紹」改為站點時間表（參考編輯行程的「詳細行程時間表」設計），
// 每個站點可分區編輯 icon／站名／時長／描述，並可填圖片 URL 或後台上傳。
// 同時相容舊版單行格式 { text, imageUrl }。
type ItineraryStep = {
  icon: string;
  title: string;
  duration: string;
  description: string;
  imageUrl: string;
};
type StoredItineraryStep = {
  icon?: string | null;
  title?: string | null;
  duration?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  text?: string | null;
};
const createEmptyItineraryStep = (): ItineraryStep => ({
  icon: '📍',
  title: '',
  duration: '',
  description: '',
  imageUrl: '',
});

type ReadinessCheck = {
  readinessOk: boolean;
  blockers: Array<{ code: string; messageZh: string }>;
  warnings: string[];
  summary: {
    activePlansCount: number;
    futureSchedulesCount: number;
    openSchedulesWithNullPlan: number;
  };
};

const PLAN_STATUS_TABS = [
  { value: '', label: '全部' },
  { value: 'active', label: '啟用中' },
  { value: 'inactive', label: '已停用' },
  { value: 'archived', label: '已封存' },
] as const;
const PLAN_STATUS_VALUES = PLAN_STATUS_TABS.map((t) => t.value);

type ActivityPlan = {
  id: string;
  activity_id: string;
  name: string;
  slug: string;
  description: string | null;
  duration_minutes: number;
  price_type: 'per_person' | 'per_group';
  base_price: number;
  min_participants: number;
  max_participants: number;
  booking_type: 'scheduled' | 'request' | 'instant';
  status: 'active' | 'inactive' | 'archived';
  created_at: string;
  updated_at: string;
  details_link_text?: string | null;
  booking_btn_text?: string | null;
  highlights?: string[] | null;
  language?: string | null;
  earliest_departure?: string | null;
  confirm_by_days?: number | null;
  free_cancel_days?: number | null;
  plan_inclusions?: string[] | null;
  plan_exclusions?: string[] | null;
  plan_itinerary?: StoredItineraryStep[] | null;
  meeting_point_name?: string | null;
  meeting_address?: string | null;
  experience_point_name?: string | null;
  experience_address?: string | null;
  plan_notices?: string[] | null;
  plan_refund_rules?: string[] | null;
};

type Activity = {
  id: string;
  title: string;
};

type ActivityPlanSeason = {
  id: string;
  name: string;
  start_month: number;
  start_day: number;
  end_month: number;
  end_day: number;
  timezone: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

type SeasonFormState = {
  name: string;
  start_month: string;
  start_day: string;
  end_month: string;
  end_day: string;
  timezone: string;
};

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

const createDefaultSeasonForm = (): SeasonFormState => ({
  name: '',
  start_month: '',
  start_day: '',
  end_month: '',
  end_day: '',
  timezone: 'Asia/Taipei',
});

const seasonToForm = (season: ActivityPlanSeason): SeasonFormState => ({
  name: season.name,
  start_month: String(season.start_month),
  start_day: String(season.start_day),
  end_month: String(season.end_month),
  end_day: String(season.end_day),
  timezone: season.timezone,
});

const formatSeasonWindow = (season: Pick<ActivityPlanSeason, 'start_month' | 'start_day' | 'end_month' | 'end_day'>) =>
  `${season.start_month}/${season.start_day} - ${season.end_month}/${season.end_day}`;

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

  const createDefaultForm = () => ({
    name: '',
    description: '',
    duration_minutes: 60,
    price_type: 'per_person' as 'per_person' | 'per_group',
    base_price: 0,
    min_participants: 1,
    max_participants: 10,
    booking_type: 'scheduled' as 'scheduled' | 'request' | 'instant',
    status: 'active' as 'active' | 'inactive' | 'archived',
    details_link_text: '',
    booking_btn_text: '',
    highlights: '',
    language: '',
    earliest_departure: '',
    confirm_by_days: '',
    free_cancel_days: '',
    plan_inclusions: '',
    plan_exclusions: '',
    plan_itinerary: [] as ItineraryStep[],
    meeting_point_name: '',
    meeting_address: '',
    experience_point_name: '',
    experience_address: '',
    plan_notices: '',
    plan_refund_rules: '',
  });

  const [form, setForm] = useState(createDefaultForm());

  const listToTextarea = (value?: string[] | null) => (Array.isArray(value) ? value.join('\n') : '');

  // 將後台儲存的行程介紹（新版站點 or 舊版 { text, imageUrl }）轉為可編輯的站點清單。
  // 舊版單行的 text 視為站名（title），讓既有資料在新站點編輯器中不流失。
  const itineraryToForm = (value?: StoredItineraryStep[] | null): ItineraryStep[] =>
    Array.isArray(value)
      ? value.map((step) => ({
          icon: (step?.icon || '📍').trim() || '📍',
          title: (step?.title || step?.text || '').trim(),
          duration: (step?.duration || '').trim(),
          description: (step?.description || '').trim(),
          imageUrl: (step?.imageUrl || '').trim(),
        }))
      : [];

  // 送出前清掉完全空白的站點；其餘交由後端 normalizeRichPlanPayload 正規化。
  const itineraryForPayload = (steps: ItineraryStep[]) =>
    (Array.isArray(steps) ? steps : [])
      .map((step) => ({
        icon: step.icon.trim(),
        title: step.title.trim(),
        duration: step.duration.trim(),
        description: step.description.trim(),
        imageUrl: step.imageUrl.trim(),
      }))
      .filter((step) => step.title || step.description || step.imageUrl);

  const parseLineList = (value: string) => value.split('\n').map((x) => x.trim()).filter(Boolean);

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
      padding: '5px 12px',
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
      <ResponsiveModal
        open={showModal}
        onClose={() => setShowModal(false)}
        size="md"
        title={editingPlan ? '編輯方案' : '新增方案'}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label htmlFor="plan-form-name" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>方案名稱 *</label>
                <input
                  id="plan-form-name"
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="例：2小時私人導覽"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label htmlFor="plan-form-description" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>方案說明</label>
                <textarea
                  id="plan-form-description"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="方案詳細說明..."
                  rows={3}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box', resize: 'vertical' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 160px' }}>
                  <label htmlFor="plan-form-duration" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>時長 (分鐘) *</label>
                  <input
                    id="plan-form-duration"
                    type="number"
                    min="15"
                    step="15"
                    value={form.duration_minutes}
                    onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ flex: '1 1 160px' }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>計價方式</label>
                  <select
                    aria-label="計價方式"
                    value={form.price_type}
                    onChange={(e) => setForm({ ...form, price_type: e.target.value as 'per_person' | 'per_group' })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14 }}
                  >
                    <option value="per_person">每人計價</option>
                    <option value="per_group">每團計價</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 160px' }}>
                  <label htmlFor="plan-form-base-price" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>基本價格 (TWD) *</label>
                  <input
                    id="plan-form-base-price"
                    type="number"
                    min="0"
                    value={form.base_price}
                    onChange={(e) => setForm({ ...form, base_price: Number(e.target.value) })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ flex: '1 1 160px' }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>預約方式</label>
                  <select
                    aria-label="預約方式"
                    value={form.booking_type}
                    onChange={(e) => setForm({ ...form, booking_type: e.target.value as 'scheduled' | 'request' | 'instant' })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14 }}
                  >
                    <option value="scheduled">排程預約</option>
                    <option value="request">申請預約</option>
                    <option value="instant">即時預約</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 160px' }}>
                  <label htmlFor="plan-form-min-participants" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>方案最低成團人數</label>
                  <input
                    id="plan-form-min-participants"
                    type="number"
                    min="1"
                    value={form.min_participants}
                    onChange={(e) => setForm({ ...form, min_participants: Number(e.target.value) })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ flex: '1 1 160px' }}>
                  <label htmlFor="plan-form-max-participants" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>方案最多人數</label>
                  <input
                    id="plan-form-max-participants"
                    type="number"
                    min="1"
                    value={form.max_participants}
                    onChange={(e) => setForm({ ...form, max_participants: Number(e.target.value) })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <details style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, background: '#f9fafb' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 700, color: '#2563eb' }}>方案詳情內容（點擊展開）</summary>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>語言導覽
                    <input type="text" value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }} />
                  </label>
                  <FormGrid cols={2} gap={10}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>「查看詳情」連結文字
                      <input type="text" value={form.details_link_text} onChange={(e) => setForm({ ...form, details_link_text: e.target.value })} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }} />
                    </label>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>預約按鈕文字
                      <input type="text" value={form.booking_btn_text} onChange={(e) => setForm({ ...form, booking_btn_text: e.target.value })} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }} />
                    </label>
                  </FormGrid>
                  <FormGrid cols={3} gap={10}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>最早可出發日
                      <input type="date" value={form.earliest_departure} onChange={(e) => setForm({ ...form, earliest_departure: e.target.value })} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }} />
                    </label>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>最晚 N 天前確認
                      <input type="number" min="0" value={form.confirm_by_days} onChange={(e) => setForm({ ...form, confirm_by_days: e.target.value })} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }} />
                    </label>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>N 天前可免費取消
                      <input type="number" min="0" value={form.free_cancel_days} onChange={(e) => setForm({ ...form, free_cancel_days: e.target.value })} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }} />
                    </label>
                  </FormGrid>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>亮點（每行一項）
                    <textarea rows={3} value={form.highlights} onChange={(e) => setForm({ ...form, highlights: e.target.value })} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }} />
                  </label>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>費用包含（每行一項）
                    <textarea rows={3} value={form.plan_inclusions} onChange={(e) => setForm({ ...form, plan_inclusions: e.target.value })} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }} />
                  </label>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>費用不包含（每行一項）
                    <textarea rows={3} value={form.plan_exclusions} onChange={(e) => setForm({ ...form, plan_exclusions: e.target.value })} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }} />
                  </label>
                  <div>
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                      行程介紹（站點時間表）— 每個站點可分區編輯，並可填圖片 URL 或後台上傳
                    </span>
                    {form.plan_itinerary.map((step, i) => (
                      <div
                        key={i}
                        style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginBottom: 12, background: '#fff' }}
                      >
                        <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                          <input
                            aria-label={`站點 ${i + 1} 圖示`}
                            value={step.icon}
                            onChange={(e) => {
                              const s = [...form.plan_itinerary];
                              s[i] = { ...s[i], icon: e.target.value };
                              setForm({ ...form, plan_itinerary: s });
                            }}
                            style={{ width: 48, border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 8px', textAlign: 'center', fontSize: 20 }}
                            placeholder="📍"
                          />
                          <input
                            aria-label={`站點 ${i + 1} 名稱`}
                            value={step.title}
                            onChange={(e) => {
                              const s = [...form.plan_itinerary];
                              s[i] = { ...s[i], title: e.target.value };
                              setForm({ ...form, plan_itinerary: s });
                            }}
                            style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 10px' }}
                            placeholder="站點名稱"
                          />
                          <input
                            aria-label={`站點 ${i + 1} 時長`}
                            value={step.duration}
                            onChange={(e) => {
                              const s = [...form.plan_itinerary];
                              s[i] = { ...s[i], duration: e.target.value };
                              setForm({ ...form, plan_itinerary: s });
                            }}
                            style={{ width: 90, border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 8px' }}
                            placeholder="60分鐘"
                          />
                          <button
                            type="button"
                            aria-label={`移除站點 ${i + 1}`}
                            onClick={() => setForm({ ...form, plan_itinerary: form.plan_itinerary.filter((_, j) => j !== i) })}
                            style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontWeight: 700 }}
                          >
                            ✕
                          </button>
                        </div>
                        <textarea
                          aria-label={`站點 ${i + 1} 描述`}
                          rows={2}
                          value={step.description}
                          onChange={(e) => {
                            const s = [...form.plan_itinerary];
                            s[i] = { ...s[i], description: e.target.value };
                            setForm({ ...form, plan_itinerary: s });
                          }}
                          style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb', boxSizing: 'border-box' }}
                          placeholder="站點描述（選填）"
                        />
                        <div style={{ marginTop: 8 }}>
                          <input
                            aria-label={`站點 ${i + 1} 圖片網址`}
                            type="url"
                            value={step.imageUrl}
                            onChange={(e) => {
                              const s = [...form.plan_itinerary];
                              s[i] = { ...s[i], imageUrl: e.target.value };
                              setForm({ ...form, plan_itinerary: s });
                            }}
                            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb', boxSizing: 'border-box' }}
                            placeholder="圖片 URL（可貼網址，或用下方按鈕上傳）"
                          />
                          {step.imageUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={step.imageUrl}
                              alt={`站點 ${i + 1} 圖片預覽`}
                              style={{ marginTop: 8, width: '100%', maxWidth: 240, aspectRatio: '3 / 2', objectFit: 'cover', borderRadius: 8, background: '#f3f4f6' }}
                            />
                          )}
                          <ImageUpload
                            activityId={activityId}
                            activitySlug={activityId}
                            type="gallery"
                            onUploaded={(url) => {
                              const s = [...form.plan_itinerary];
                              s[i] = { ...s[i], imageUrl: url };
                              setForm({ ...form, plan_itinerary: s });
                            }}
                          />
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, plan_itinerary: [...form.plan_itinerary, createEmptyItineraryStep()] })}
                      style={{ background: '#eff6ff', color: '#2563eb', border: '1px dashed #93c5fd', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', width: '100%' }}
                    >
                      + 新增站點
                    </button>
                  </div>
                  <FormGrid cols={2} gap={10}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>集合地點名稱
                      <input type="text" value={form.meeting_point_name} onChange={(e) => setForm({ ...form, meeting_point_name: e.target.value })} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }} />
                    </label>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>集合地址
                      <input type="text" value={form.meeting_address} onChange={(e) => setForm({ ...form, meeting_address: e.target.value })} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }} />
                    </label>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>體驗地點名稱
                      <input type="text" value={form.experience_point_name} onChange={(e) => setForm({ ...form, experience_point_name: e.target.value })} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }} />
                    </label>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>體驗地址
                      <input type="text" value={form.experience_address} onChange={(e) => setForm({ ...form, experience_address: e.target.value })} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }} />
                    </label>
                  </FormGrid>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>購買須知（每行一項）
                    <textarea rows={3} value={form.plan_notices} onChange={(e) => setForm({ ...form, plan_notices: e.target.value })} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }} />
                  </label>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>取消政策（每行一項）
                    <textarea rows={3} value={form.plan_refund_rules} onChange={(e) => setForm({ ...form, plan_refund_rules: e.target.value })} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }} />
                  </label>
                </div>
              </details>
              {editingPlan && (
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>狀態</label>
                  <select
                    aria-label="狀態"
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as 'active' | 'inactive' | 'archived' })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14 }}
                  >
                    <option value="active">啟用</option>
                    <option value="inactive">停用</option>
                    <option value="archived">已封存</option>
                  </select>
                </div>
              )}
              {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', color: '#dc2626', fontSize: 13 }}>
                  {error}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <button onClick={savePlan} disabled={saving} style={btn(saving ? '#86efac' : '#16a34a', '#fff')}>
                  {saving ? '儲存中...' : '儲存'}
                </button>
                <button onClick={() => setShowModal(false)} style={btn('#fff', '#374151', '1px solid #d1d5db')}>
                  取消
                </button>
              </div>
            </div>
      </ResponsiveModal>

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
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, color: '#111827' }}>開放季節</h3>
                <p style={{ margin: '6px 0 0', fontSize: 14, color: '#6b7280' }}>
                  {seasonPanelPlanName}：管理可販售季節區間與停用狀態。
                </p>
              </div>
              <button onClick={() => openSeasonForm()} style={btn('#2563eb', '#fff')}>
                新增季節
              </button>
            </div>

            {!hasActiveSeasons && !seasonLoading && (
              <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
                <div style={{ fontWeight: 700, color: '#9a3412', marginBottom: 4 }}>請先設定指定季節</div>
                <div style={{ fontSize: 14, color: '#9a3412' }}>
                  「全年開放」資料持久化仍在另一個資料契約切片處理中，空白季節或全部停用都不代表旅客端可全年販售。
                </div>
              </div>
            )}

            {seasonError && (
              <div role="alert" aria-live="polite" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', color: '#b91c1c', fontSize: 14, marginBottom: 16 }}>
                {seasonError}
              </div>
            )}

            {seasonNotice && (
              <div role="status" aria-live="polite" style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '10px 14px', color: '#1d4ed8', fontSize: 14, marginBottom: 16 }}>
                {seasonNotice}
              </div>
            )}

            {showSeasonForm && (
              <div style={{ border: '1px solid #dbeafe', background: '#f8fbff', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                <div style={{ fontWeight: 700, color: '#1e3a8a', marginBottom: 12 }}>{editingSeason ? '編輯季節' : '新增季節'}</div>
                <div style={{ display: 'grid', gap: 12 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>
                    季節名稱
                    <input
                      type="text"
                      aria-label="季節名稱"
                      value={seasonForm.name}
                      onChange={(e) => setSeasonForm({ ...seasonForm, name: e.target.value })}
                      style={{ width: '100%', marginTop: 4, padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, boxSizing: 'border-box' }}
                    />
                  </label>
                  <FormGrid cols={2} gap={12}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>
                      開始月份
                      <input
                        type="number"
                        min="1"
                        max="12"
                        aria-label="開始月份"
                        value={seasonForm.start_month}
                        onChange={(e) => setSeasonForm({ ...seasonForm, start_month: e.target.value })}
                        style={{ width: '100%', marginTop: 4, padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, boxSizing: 'border-box' }}
                      />
                    </label>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>
                      開始日期
                      <input
                        type="number"
                        min="1"
                        max="31"
                        aria-label="開始日期"
                        value={seasonForm.start_day}
                        onChange={(e) => setSeasonForm({ ...seasonForm, start_day: e.target.value })}
                        style={{ width: '100%', marginTop: 4, padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, boxSizing: 'border-box' }}
                      />
                    </label>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>
                      結束月份
                      <input
                        type="number"
                        min="1"
                        max="12"
                        aria-label="結束月份"
                        value={seasonForm.end_month}
                        onChange={(e) => setSeasonForm({ ...seasonForm, end_month: e.target.value })}
                        style={{ width: '100%', marginTop: 4, padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, boxSizing: 'border-box' }}
                      />
                    </label>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>
                      結束日期
                      <input
                        type="number"
                        min="1"
                        max="31"
                        aria-label="結束日期"
                        value={seasonForm.end_day}
                        onChange={(e) => setSeasonForm({ ...seasonForm, end_day: e.target.value })}
                        style={{ width: '100%', marginTop: 4, padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, boxSizing: 'border-box' }}
                      />
                    </label>
                  </FormGrid>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>
                    時區
                    <input
                      type="text"
                      aria-label="時區"
                      value={seasonForm.timezone}
                      onChange={(e) => setSeasonForm({ ...seasonForm, timezone: e.target.value })}
                      style={{ width: '100%', marginTop: 4, padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, boxSizing: 'border-box' }}
                    />
                  </label>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                  <button onClick={saveSeason} disabled={seasonSaving} style={btn(seasonSaving ? '#93c5fd' : '#2563eb', '#fff')}>
                    {seasonSaving ? '儲存中...' : '儲存季節'}
                  </button>
                  <button onClick={closeSeasonForm} disabled={seasonSaving} style={btn('#fff', '#374151', '1px solid #d1d5db')}>
                    取消
                  </button>
                </div>
              </div>
            )}

            {seasonLoading ? (
              <div style={{ fontSize: 14, color: '#6b7280' }}>載入開放季節中...</div>
            ) : seasons.length === 0 ? (
              <div style={{ border: '1px dashed #cbd5e1', borderRadius: 12, padding: 20, color: '#64748b', fontSize: 14 }}>
                尚未建立季節區間。請先新增季節，避免把空白狀態誤解為全年開放。
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {seasons.map((season) => (
                  <div key={season.id} style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, background: season.is_active ? '#ffffff' : '#f8fafc' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontWeight: 700, color: '#111827' }}>{season.name}</div>
                        <div style={{ marginTop: 6, fontSize: 14, color: '#374151' }}>{formatSeasonWindow(season)}</div>
                        <div style={{ marginTop: 4, fontSize: 13, color: '#6b7280' }}>{season.timezone}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Badge variant={season.is_active ? 'success' : 'default'}>{season.is_active ? '啟用中' : '已停用'}</Badge>
                        <button onClick={() => openSeasonForm(season)} style={smallBtn('#e0f2fe', '#075985')}>編輯季節</button>
                        {season.is_active && (
                          <button onClick={() => void disableSeason(season)} style={smallBtn('#fee2e2', '#991b1b')}>
                            停用季節
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
