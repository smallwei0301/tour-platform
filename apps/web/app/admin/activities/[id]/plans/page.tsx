'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, PageHeader, Badge, EmptyState, LoadingSkeleton, TableWrapper, Th, Td } from '../../../../../src/components/admin/ui';

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
};

type Activity = {
  id: string;
  title: string;
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
  const [statusFilter, setStatusFilter] = useState<string>('');

  const [form, setForm] = useState({
    name: '',
    description: '',
    duration_minutes: 60,
    price_type: 'per_person' as 'per_person' | 'per_group',
    base_price: 0,
    min_participants: 1,
    max_participants: 10,
    booking_type: 'scheduled' as 'scheduled' | 'request' | 'instant',
    status: 'active' as 'active' | 'inactive' | 'archived',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v2/admin/activities/${activityId}/plans`);
      const json = await res.json();
      if (json.success) {
        setActivity(json.data.activity);
        setPlans(json.data.plans || []);
      }
    } finally {
      setLoading(false);
    }
  }, [activityId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openModal = (plan?: ActivityPlan) => {
    if (plan) {
      setEditingPlan(plan);
      setForm({
        name: plan.name,
        description: plan.description || '',
        duration_minutes: plan.duration_minutes,
        price_type: plan.price_type,
        base_price: plan.base_price,
        min_participants: plan.min_participants,
        max_participants: plan.max_participants,
        booking_type: plan.booking_type,
        status: plan.status,
      });
    } else {
      setEditingPlan(null);
      setForm({
        name: '',
        description: '',
        duration_minutes: 60,
        price_type: 'per_person',
        base_price: 0,
        min_participants: 1,
        max_participants: 10,
        booking_type: 'scheduled',
        status: 'active',
      });
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

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();

      if (json.success) {
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
    await fetch(`/api/v2/admin/activities/${activityId}/plans/${planId}`, { method: 'DELETE' });
    await loadData();
  };

  const toggleStatus = async (plan: ActivityPlan) => {
    const newStatus = plan.status === 'active' ? 'inactive' : 'active';
    await fetch(`/api/v2/admin/activities/${activityId}/plans/${plan.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    await loadData();
  };

  const filteredPlans = statusFilter
    ? plans.filter((p) => p.status === statusFilter)
    : plans;

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

      {/* ── Modal ── */}
      {showModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, maxWidth: 560, width: '95%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700 }}>{editingPlan ? '編輯方案' : '新增方案'}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>方案名稱 *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="例：2小時私人導覽"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>方案說明</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="方案詳細說明..."
                  rows={3}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box', resize: 'vertical' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>時長 (分鐘) *</label>
                  <input
                    type="number"
                    min="15"
                    step="15"
                    value={form.duration_minutes}
                    onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>計價方式</label>
                  <select
                    value={form.price_type}
                    onChange={(e) => setForm({ ...form, price_type: e.target.value as 'per_person' | 'per_group' })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14 }}
                  >
                    <option value="per_person">每人計價</option>
                    <option value="per_group">每團計價</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>基本價格 (TWD) *</label>
                  <input
                    type="number"
                    min="0"
                    value={form.base_price}
                    onChange={(e) => setForm({ ...form, base_price: Number(e.target.value) })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>預約方式</label>
                  <select
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
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>最少人數</label>
                  <input
                    type="number"
                    min="1"
                    value={form.min_participants}
                    onChange={(e) => setForm({ ...form, min_participants: Number(e.target.value) })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>最多人數</label>
                  <input
                    type="number"
                    min="1"
                    value={form.max_participants}
                    onChange={(e) => setForm({ ...form, max_participants: Number(e.target.value) })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }}
                  />
                </div>
              </div>
              {editingPlan && (
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>狀態</label>
                  <select
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
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={savePlan} disabled={saving} style={btn(saving ? '#86efac' : '#16a34a', '#fff')}>
                  {saving ? '儲存中...' : '儲存'}
                </button>
                <button onClick={() => setShowModal(false)} style={btn('#fff', '#374151', '1px solid #d1d5db')}>
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: '20px 28px' }}>
        {/* Status Filter */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid #f0f0f0', paddingBottom: 0 }}>
          {[
            { value: '', label: '全部' },
            { value: 'active', label: '啟用中' },
            { value: 'inactive', label: '已停用' },
            { value: 'archived', label: '已封存' },
          ].map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
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

        <Card>
          {loading ? (
            <LoadingSkeleton />
          ) : filteredPlans.length === 0 ? (
            <EmptyState message={statusFilter ? `沒有${STATUS_CONFIG[statusFilter]?.label || ''}方案` : '尚無方案，點擊「新增方案」建立第一個'} />
          ) : (
            <TableWrapper>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <Th>方案名稱</Th>
                    <Th>時長</Th>
                    <Th>價格</Th>
                    <Th>人數</Th>
                    <Th>預約方式</Th>
                    <Th>狀態</Th>
                    <Th>操作</Th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPlans.map((plan) => {
                    const statusCfg = STATUS_CONFIG[plan.status] || { variant: 'default', label: plan.status };
                    return (
                      <tr key={plan.id}>
                        <Td>
                          <div style={{ fontWeight: 600 }}>{plan.name}</div>
                          {plan.description && (
                            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                              {plan.description.length > 50 ? plan.description.slice(0, 50) + '...' : plan.description}
                            </div>
                          )}
                        </Td>
                        <Td>{plan.duration_minutes} 分鐘</Td>
                        <Td>
                          NT${plan.base_price.toLocaleString()} / {PRICE_TYPE_LABELS[plan.price_type]}
                        </Td>
                        <Td>
                          {plan.min_participants}-{plan.max_participants} 人
                        </Td>
                        <Td>{BOOKING_TYPE_LABELS[plan.booking_type]}</Td>
                        <Td>
                          <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
                        </Td>
                        <Td>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <button onClick={() => openModal(plan)} style={smallBtn('#f0f0f0', '#333')}>
                              編輯
                            </button>
                            {plan.status !== 'archived' && (
                              <button onClick={() => toggleStatus(plan)} style={smallBtn(plan.status === 'active' ? '#fef9c3' : '#dcfce7', plan.status === 'active' ? '#854d0e' : '#166534')}>
                                {plan.status === 'active' ? '停用' : '啟用'}
                              </button>
                            )}
                            {plan.status !== 'archived' && (
                              <button onClick={() => archivePlan(plan.id)} style={smallBtn('#fee2e2', '#991b1b')}>
                                封存
                              </button>
                            )}
                          </div>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrapper>
          )}
        </Card>
      </div>
    </div>
  );
}
