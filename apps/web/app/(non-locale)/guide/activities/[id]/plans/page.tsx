'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';

type PlanRow = {
  id: string;
  name: string;
  base_price: number | null;
  price_type: string | null;
  duration_minutes: number | null;
  status: string;
  reviewState: 'pending' | 'changes_requested' | null;
  reviewAdminNote: string | null;
  isNewPlan: boolean;
  hasPendingChanges: boolean;
};

const PRICE_TYPE_LABEL: Record<string, string> = { per_person: '每人', per_group: '每團' };

function StatusBadge({ plan }: { plan: PlanRow }) {
  const base: React.CSSProperties = { fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 999 };
  if (plan.reviewState === 'pending') {
    return <span style={{ ...base, background: '#dbeafe', color: '#1e40af' }}>🔍 審核中</span>;
  }
  if (plan.reviewState === 'changes_requested') {
    return <span style={{ ...base, background: '#fee2e2', color: '#991b1b' }}>↩️ 已退回，請修改</span>;
  }
  if (plan.isNewPlan && plan.status === 'inactive') {
    return <span style={{ ...base, background: '#f1f5f9', color: '#475569' }}>草稿（未送審）</span>;
  }
  if (plan.status === 'active') {
    return <span style={{ ...base, background: '#dcfce7', color: '#166534' }}>已上架</span>;
  }
  return <span style={{ ...base, background: '#f1f5f9', color: '#475569' }}>已下架</span>;
}

export default function GuidePlansListPage() {
  const params = useParams();
  const router = useRouter();
  const activityId = String(params?.id || '');

  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/guide/activities/${activityId}/plans`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (j.ok) setPlans(j.data || []); else setError(j.error?.message || '載入失敗'); })
      .catch(() => setError('載入失敗'))
      .finally(() => setLoading(false));
  }, [activityId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <button onClick={() => router.push(`/guide/activities/${activityId}/edit`)} style={{ background: 'none', border: 'none', color: '#7c3aed', cursor: 'pointer', marginBottom: 12, fontSize: 14 }}>
        ‹ 返回行程編輯
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>方案管理</h1>
        <button
          onClick={() => router.push(`/guide/activities/${activityId}/plans/new`)}
          style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}
        >
          ＋ 新增方案
        </button>
      </div>
      <p style={{ color: '#64748b', fontSize: 13, marginBottom: 20 }}>
        方案（含每方案價格）的新增與修改都會送管理者審核，核准後才會生效上架。已上架方案在審核期間，前台仍以原內容售票。
      </p>

      {error && <div style={{ background: '#fee2e2', color: '#991b1b', padding: 12, borderRadius: 8, marginBottom: 16 }} role="alert">{error}</div>}

      {loading ? (
        <p style={{ color: '#64748b' }}>載入中…</p>
      ) : plans.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 24, textAlign: 'center', color: '#64748b' }}>
          尚未建立任何方案。點「新增方案」開始建立第一個可預約方案。
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {plans.map((plan) => (
            <div key={plan.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>{plan.name || '（未命名方案）'}</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', color: '#475569', fontSize: 13 }}>
                    <StatusBadge plan={plan} />
                    <span>
                      NT$ {plan.base_price ?? 0}／{PRICE_TYPE_LABEL[plan.price_type || ''] || '每人'}
                    </span>
                    {plan.duration_minutes ? <span>· {plan.duration_minutes} 分鐘</span> : null}
                  </div>
                  {plan.reviewState === 'changes_requested' && plan.reviewAdminNote && (
                    <div style={{ marginTop: 8, fontSize: 13, color: '#991b1b' }}>退回原因：{plan.reviewAdminNote}</div>
                  )}
                </div>
                <button
                  onClick={() => router.push(`/guide/activities/${activityId}/plans/${plan.id}`)}
                  style={{ background: '#fff', border: '1px solid #7c3aed', color: '#7c3aed', borderRadius: 8, padding: '8px 16px', fontWeight: 600, cursor: 'pointer', fontSize: 14, whiteSpace: 'nowrap' }}
                >
                  編輯
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
