'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, PageHeader } from '../../../../src/components/admin/ui';

type GuideDetail = {
  id: string;
  display_name: string;
  slug: string;
  verification_status: string;
  headline?: string | null;
  region?: string | null;
  rating_avg?: number | null;
  guide_email?: string | null;
  profile_photo_url?: string | null;
  bio?: string | null;
  specialty?: string | null;
  created_at?: string | null;
};

export default function AdminGuideDetailPage() {
  const params = useParams();
  const router = useRouter();
  const guideId = params?.guideId as string;

  const [guide, setGuide] = useState<GuideDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!guideId) return;
    setLoading(true);
    fetch(`/api/admin/guides/${guideId}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(json => {
        if (json?.ok && json?.data) {
          setGuide(json.data as GuideDetail);
        } else {
          setError(json?.error?.message || '找不到導遊資料');
        }
      })
      .catch(() => setError('載入失敗'))
      .finally(() => setLoading(false));
  }, [guideId]);

  const isSuspended = guide?.verification_status === 'suspended';

  return (
    <div style={{ background: '#f9fafb', minHeight: '100vh' }}>
      <PageHeader
        title="導遊詳情"
        subtitle={guide?.display_name || '載入中…'}
      />

      <div className="admin-page" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Back button */}
        <div>
          <button
            onClick={() => router.push('/admin/guides')}
            style={{
              padding: '8px 16px', borderRadius: 8,
              border: '1px solid #e5e7eb', background: '#fff',
              color: '#374151', fontSize: 14, fontWeight: 500, cursor: 'pointer',
            }}
          >
            ← 返回導遊管理
          </button>
        </div>

        {loading && (
          <Card>
            <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>載入中…</div>
          </Card>
        )}

        {!loading && error && (
          <Card>
            <div style={{ padding: 40, textAlign: 'center', color: '#dc2626' }}>{error}</div>
          </Card>
        )}

        {!loading && guide && (
          <Card style={{ padding: 28 }}>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {/* Avatar */}
              <div style={{ flexShrink: 0 }}>
                {guide.profile_photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={guide.profile_photo_url}
                    alt={guide.display_name}
                    style={{ width: 100, height: 100, borderRadius: '50%', objectFit: 'cover', border: '3px solid #e5e7eb' }}
                  />
                ) : (
                  <div style={{
                    width: 100, height: 100, borderRadius: '50%', background: '#e5e7eb',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 36, color: '#9ca3af',
                  }}>
                    👤
                  </div>
                )}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#111' }}>{guide.display_name}</h2>
                  <span style={{
                    padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                    background: isSuspended ? '#fee2e2' : '#d1fae5',
                    color: isSuspended ? '#dc2626' : '#065f46',
                  }}>
                    {isSuspended ? '已停權' : guide.verification_status === 'approved' ? '已審核' : guide.verification_status}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 8 }}>@{guide.slug}</div>
                {guide.headline && (
                  <div style={{ fontSize: 14, color: '#374151', marginBottom: 8 }}>{guide.headline}</div>
                )}
                {guide.specialty && (
                  <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>
                    <strong>專長：</strong>{guide.specialty}
                  </div>
                )}
              </div>
            </div>

            <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Contact & meta */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))', gap: 12 }}>
                <div style={{ background: '#f9fafb', borderRadius: 8, padding: '12px 16px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>電子信箱</div>
                  <div style={{ fontSize: 14, color: '#374151', fontFamily: 'monospace' }}>
                    {guide.guide_email || <span style={{ color: '#9ca3af' }}>未設定</span>}
                  </div>
                </div>
                {guide.region && (
                  <div style={{ background: '#f9fafb', borderRadius: 8, padding: '12px 16px' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>地區</div>
                    <div style={{ fontSize: 14, color: '#374151' }}>📍 {guide.region}</div>
                  </div>
                )}
                {guide.rating_avg != null && (
                  <div style={{ background: '#f9fafb', borderRadius: 8, padding: '12px 16px' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>評分</div>
                    <div style={{ fontSize: 14, color: '#374151' }}>⭐ {guide.rating_avg.toFixed(1)}</div>
                  </div>
                )}
                {guide.created_at && (
                  <div style={{ background: '#f9fafb', borderRadius: 8, padding: '12px 16px' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>申請日期</div>
                    <div style={{ fontSize: 14, color: '#374151' }}>🗓️ {new Date(guide.created_at).toLocaleDateString('zh-TW')}</div>
                  </div>
                )}
              </div>

              {/* Bio */}
              {guide.bio && (
                <div style={{ background: '#f9fafb', borderRadius: 8, padding: '16px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>個人簡介</div>
                  <p style={{ margin: 0, fontSize: 14, color: '#374151', lineHeight: 1.7 }}>{guide.bio}</p>
                </div>
              )}

              {/* Action links */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                <a
                  href={`/admin/guides/${guide.id}/availability`}
                  style={{
                    padding: '9px 16px', borderRadius: 8, border: '1px solid #10b981',
                    background: '#ecfdf5', color: '#059669', fontSize: 13, fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  📅 時間管理
                </a>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
