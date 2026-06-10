'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, PageHeader } from '../../../../src/components/admin/ui';

type GuideApplicationDetail = {
  fullName: string;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  bio?: string | null;
  specialties?: string[];
  languages?: string[];
  regions?: string[];
  certifications?: string[];
  paymentMethod?: string | null;
  status: string;
  adminNote?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type GuideDetail = {
  // 雙實體：同一條 URL 可能解析到正式導遊檔案（profile）或導遊申請
  // （application，尚未建檔）。kind 由 API 判定。
  kind?: 'profile' | 'application';
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
  application?: GuideApplicationDetail;
};

const APPLICATION_STATUS_LABELS: Record<string, { label: string; bg: string; color: string }> = {
  pending: { label: '待審核', bg: '#fef3c7', color: '#92400e' },
  approved: { label: '已通過', bg: '#d1fae5', color: '#065f46' },
  rejected: { label: '已拒絕', bg: '#fee2e2', color: '#dc2626' },
  suspended: { label: '已停權', bg: '#fee2e2', color: '#dc2626' },
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

        {/* 申請詳情視圖：此 ID 是 guide_applications（尚未建立正式導遊檔案） */}
        {!loading && guide && guide.kind === 'application' && guide.application && (
          <Card data-testid="admin-guide-application-detail" style={{ padding: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#111' }}>{guide.application.fullName}</h2>
              {(() => {
                const s = APPLICATION_STATUS_LABELS[guide.application.status] || { label: guide.application.status, bg: '#f3f4f6', color: '#6b7280' };
                return (
                  <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: s.bg, color: s.color }}>
                    {s.label}
                  </span>
                );
              })()}
            </div>
            <p style={{ margin: '8px 0 16px', fontSize: 13, color: '#92400e', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 12px' }}>
              此為導遊「申請資料」，尚未建立正式導遊檔案。請於導遊管理列表完成審核；申請通過並按「上線」後，系統才會建立正式導遊檔案。
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))', gap: 12 }}>
              <div style={{ background: '#f9fafb', borderRadius: 8, padding: '12px 16px' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>電子信箱</div>
                <div style={{ fontSize: 14, color: '#374151', fontFamily: 'monospace' }}>{guide.application.email || <span style={{ color: '#9ca3af' }}>未提供</span>}</div>
              </div>
              <div style={{ background: '#f9fafb', borderRadius: 8, padding: '12px 16px' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>電話</div>
                <div style={{ fontSize: 14, color: '#374151' }}>{guide.application.phone || <span style={{ color: '#9ca3af' }}>未提供</span>}</div>
              </div>
              <div style={{ background: '#f9fafb', borderRadius: 8, padding: '12px 16px' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>城市</div>
                <div style={{ fontSize: 14, color: '#374151' }}>📍 {guide.application.city || '未提供'}</div>
              </div>
              {guide.application.createdAt && (
                <div style={{ background: '#f9fafb', borderRadius: 8, padding: '12px 16px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>申請日期</div>
                  <div style={{ fontSize: 14, color: '#374151' }}>🗓️ {new Date(guide.application.createdAt).toLocaleDateString('zh-TW')}</div>
                </div>
              )}
            </div>
            {/* 申請人自填的專長/語言/服務地區/證照 — 上線時自動帶入導遊檔案 */}
            {([
              { label: '專長', items: guide.application.specialties },
              { label: '語言', items: guide.application.languages },
              { label: '服務地區', items: guide.application.regions },
              { label: '證照（自述，僅供審核參考）', items: guide.application.certifications },
            ] as Array<{ label: string; items?: string[] }>).map((section) =>
              section.items && section.items.length > 0 ? (
                <div key={section.label} style={{ marginTop: 12, background: '#f9fafb', borderRadius: 8, padding: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{section.label}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {section.items.map((item) => (
                      <span key={item} style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: '#eef2ff', color: '#3730a3' }}>
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null
            )}
            {guide.application.bio && (
              <div style={{ marginTop: 12, background: '#f9fafb', borderRadius: 8, padding: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>個人簡介</div>
                <p style={{ margin: 0, fontSize: 14, color: '#374151', lineHeight: 1.7 }}>{guide.application.bio}</p>
              </div>
            )}
            {guide.application.adminNote && (
              <div style={{ marginTop: 12, background: '#f9fafb', borderRadius: 8, padding: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>管理員備註</div>
                <p style={{ margin: 0, fontSize: 14, color: '#374151', lineHeight: 1.7 }}>{guide.application.adminNote}</p>
              </div>
            )}
          </Card>
        )}

        {!loading && guide && guide.kind !== 'application' && (
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
