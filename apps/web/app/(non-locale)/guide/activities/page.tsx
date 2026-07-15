'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfHeaders } from '../../../../src/lib/csrf-client';

type GuideActivity = {
  id: string;
  title: string;
  region: string | null;
  status: string;
  reviewState: 'pending' | 'changes_requested' | null;
  reviewAdminNote: string | null;
  hasPendingChanges: boolean;
  updatedAt: string;
};

// 上架狀態（draft/published/archived）與審核狀態（reviewState）兩條獨立維度，分開顯示。
const STATUS_LABEL: Record<string, { bg: string; color: string; label: string }> = {
  draft: { bg: '#fef9c3', color: '#854d0e', label: '草稿' },
  published: { bg: '#dcfce7', color: '#166534', label: '已上架' },
  archived: { bg: '#f1f5f9', color: '#475569', label: '已下架' },
};

const REVIEW_LABEL: Record<string, { bg: string; color: string; label: string }> = {
  pending: { bg: '#dbeafe', color: '#1e40af', label: '審核中' },
  changes_requested: { bg: '#fee2e2', color: '#991b1b', label: '已退回，請修改' },
};

function Pill({ tone }: { tone: { bg: string; color: string; label: string } }) {
  return (
    <span style={{ background: tone.bg, color: tone.color, fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 999 }}>
      {tone.label}
    </span>
  );
}

export default function GuideActivitiesPage() {
  const router = useRouter();
  const [items, setItems] = useState<GuideActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void fetch('/api/guide/auth/csrf', { cache: 'no-store' });
    fetch('/api/guide/activities')
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setItems(j.data || []);
        else setError(j.error?.message || '載入失敗');
      })
      .catch(() => setError('載入失敗'))
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate() {
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/guide/activities', {
        method: 'POST',
        headers: csrfHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ title: '未命名行程' }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message || '建立失敗');
      router.push(`/guide/activities/${json.data.id}/edit`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '建立失敗');
      setCreating(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>我的行程</h1>
          <p style={{ color: '#64748b', margin: '4px 0 0', fontSize: 14 }}>
            編輯自己的行程內容，送出後由管理者審核上架。已上架的行程在審核期間照常顯示原內容。
          </p>
        </div>
        <button
          onClick={handleCreate}
          disabled={creating}
          style={{ background: '#0f766e', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 600, cursor: creating ? 'default' : 'pointer' }}
        >
          {creating ? '建立中…' : '＋ 新建行程'}
        </button>
      </div>

      {error && (
        <div style={{ background: '#fee2e2', color: '#991b1b', padding: 12, borderRadius: 8, marginBottom: 16 }} role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <p style={{ color: '#64748b' }}>載入中…</p>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 16px', color: '#64748b', background: '#f8fafc', borderRadius: 12 }}>
          還沒有行程，點右上角「＋ 新建行程」開始建立你的第一個行程。
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {items.map((a) => (
            <button
              key={a.id}
              onClick={() => router.push(`/guide/activities/${a.id}/edit`)}
              style={{ textAlign: 'left', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title || '（未命名）'}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Pill tone={STATUS_LABEL[a.status] || STATUS_LABEL.draft} />
                  {a.reviewState && <Pill tone={REVIEW_LABEL[a.reviewState]} />}
                  {!a.reviewState && a.hasPendingChanges && (
                    <span style={{ fontSize: 12, color: '#854d0e' }}>有未送審的修改</span>
                  )}
                  {a.region && <span style={{ fontSize: 12, color: '#94a3b8' }}>{a.region}</span>}
                </div>
                {a.reviewState === 'changes_requested' && a.reviewAdminNote && (
                  <div style={{ marginTop: 6, fontSize: 13, color: '#991b1b' }}>退回原因：{a.reviewAdminNote}</div>
                )}
              </div>
              <span style={{ color: '#94a3b8', fontSize: 20 }}>›</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
