import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getActivityBySlugDb } from '../../../../src/lib/db.mjs';

export async function generateMetadata(
  { params }: { params: Promise<{ region: string; slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const activity = await getActivityBySlugDb(slug).catch(() => null);
  if (!activity) return { title: '行程不存在 | Tour Platform' };
  return {
    title: `${activity.title} | Tour Platform`,
    description: activity.shortDescription || activity.tagline,
    openGraph: {
      title: activity.title,
      description: activity.shortDescription || activity.tagline,
      images: activity.coverImageUrl ? [{ url: activity.coverImageUrl }] : [],
    },
  };
}

export default async function ActivityDetailPage({ params }: { params: Promise<{ region: string; slug: string }> }) {
  const { slug } = await params;
  const activity = await getActivityBySlugDb(slug).catch(() => null);
  if (!activity) return notFound();

  const guide = activity.guide;
  const displayedSchedules = activity.schedules || [];
  const actReviews = activity.reviews || [];

  const imageUrls: string[] = activity.imageUrls?.length
    ? activity.imageUrls
    : activity.coverImageUrl
      ? [activity.coverImageUrl]
      : [];

  return (
    <main className="tp-container tp-detail" style={{ paddingBottom: 40 }}>
      <div className="tp-breadcrumb">
        首頁 &gt; <Link href="/activities">全部行程</Link> &gt; {activity.region} &gt; {activity.title}
      </div>

      <section className="tp-activity-detail-layout" style={{ display: 'grid', gap: 24, marginTop: 12 }}>
        {/* Main */}
        <article>
          {/* Gallery */}
          {imageUrls.length > 0 && (
            <div className="tp-activity-gallery-layout" style={{ display: 'grid', gap: 8 }}>
              <img src={imageUrls[0]} alt={activity.title} style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 12 }} />
              {imageUrls.length > 1 && (
                <div style={{ display: 'grid', gap: 8 }}>
                  {imageUrls.slice(1, 4).map((url: string, i: number) => (
                    <img key={i} src={url} alt={`${activity.title} ${i + 2}`} style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 10 }} loading="lazy" />
                  ))}
                </div>
              )}
            </div>
          )}

          <h1 style={{ marginTop: 18 }}>{activity.title}</h1>
          <p style={{ color: 'var(--tp-muted)' }}>⭐ {activity.guide?.ratingAvg?.toFixed(1) || '5.0'}（{actReviews.length} 則評價） · 📍 {activity.region}</p>

          <div className="tp-badges" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0' }}>
            <span style={{ background: '#e6f4ed', color: 'var(--tp-primary)', padding: '5px 12px', borderRadius: 8, fontSize: 13 }}>✅ 認證導遊</span>
            {activity.durationDisplay && (
              <span style={{ background: '#e6f4ed', color: 'var(--tp-primary)', padding: '5px 12px', borderRadius: 8, fontSize: 13 }}>🕐 {activity.durationDisplay}</span>
            )}
            {activity.minParticipants && activity.maxParticipants && (
              <span style={{ background: '#e6f4ed', color: 'var(--tp-primary)', padding: '5px 12px', borderRadius: 8, fontSize: 13 }}>👥 {activity.minParticipants}~{activity.maxParticipants} 人</span>
            )}
          </div>

          {/* Description */}
          <section className="tp-detail-block" style={{ marginBottom: 24 }}>
            <h2>行程簡介</h2>
            <p style={{ lineHeight: 1.8 }}>{activity.description || activity.shortDescription}</p>
          </section>

          {/* Inclusions / Exclusions */}
          {(activity.inclusions?.length > 0 || activity.exclusions?.length > 0) && (
            <section className="tp-detail-block" style={{ marginBottom: 24 }}>
              <h2>行程包含 / 不含</h2>
              <div className="tp-activity-two-col" style={{ display: 'grid', gap: 16 }}>
                {activity.inclusions?.length > 0 && (
                  <div>
                    <h4 style={{ color: 'var(--tp-primary)' }}>✅ 行程包含</h4>
                    <ul style={{ paddingLeft: 18, lineHeight: 2 }}>
                      {activity.inclusions.map((item: string, i: number) => <li key={i}>{item}</li>)}
                    </ul>
                  </div>
                )}
                {activity.exclusions?.length > 0 && (
                  <div>
                    <h4 style={{ color: '#e53e3e' }}>❌ 行程不含</h4>
                    <ul style={{ paddingLeft: 18, lineHeight: 2 }}>
                      {activity.exclusions.map((item: string, i: number) => <li key={i}>{item}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Notices */}
          {activity.notices?.length > 0 && (
            <section className="tp-detail-block" style={{ marginBottom: 24 }}>
              <h2>注意事項</h2>
              <ul style={{ paddingLeft: 18, lineHeight: 2, color: 'var(--tp-muted)' }}>
                {activity.notices.map((n: string, i: number) => <li key={i}>{n}</li>)}
              </ul>
            </section>
          )}

          {/* Suitability */}
          {(activity.goodFor?.length > 0 || activity.notGoodFor?.length > 0) && (
            <section className="tp-detail-block" style={{ marginBottom: 24 }}>
              <h2>適合對象</h2>
              <div className="tp-activity-two-col" style={{ display: 'grid', gap: 16 }}>
                {activity.goodFor?.length > 0 && (
                  <div>
                    <h4>👍 適合</h4>
                    <ul style={{ paddingLeft: 18, lineHeight: 2 }}>
                      {activity.goodFor.map((item: string, i: number) => <li key={i}>{item}</li>)}
                    </ul>
                  </div>
                )}
                {activity.notGoodFor?.length > 0 && (
                  <div>
                    <h4>⚠️ 不太適合</h4>
                    <ul style={{ paddingLeft: 18, lineHeight: 2, color: 'var(--tp-muted)' }}>
                      {activity.notGoodFor.map((item: string, i: number) => <li key={i}>{item}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Guide */}
          {guide && (
            <section className="tp-detail-block" style={{ marginBottom: 24 }}>
              <h2>關於你的導遊</h2>
              <div className="tp-activity-guide-block" style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                {guide.profilePhotoUrl && (
                  <img src={guide.profilePhotoUrl} alt={guide.displayName} style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover' }} />
                )}
                <div>
                  <strong>{guide.displayName}</strong> · ✅ 實名已驗證
                  <p style={{ margin: '4px 0', color: 'var(--tp-muted)', fontSize: 14 }}>
                    ⭐ {guide.ratingAvg?.toFixed(1) || '5.0'}（{guide.reviewCount || 0} 則評價） · 📍 {guide.region}
                    {guide.languages?.length > 0 && ` · 🌍 ${guide.languages.slice(0, 3).join('、')}`}
                  </p>
                  {guide.headline && (
                    <p style={{ margin: 0, fontStyle: 'italic', color: 'var(--tp-muted)', fontSize: 14 }}>「{guide.headline}」</p>
                  )}
                  {guide.slug && (
                    <Link className="tp-link" href={`/guides/${guide.slug}`} style={{ fontSize: 14 }}>查看完整導遊簡介 →</Link>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* FAQ */}
          {activity.faq?.length > 0 && (
            <section className="tp-detail-block" style={{ marginBottom: 24 }}>
              <h2>常見問題</h2>
              <div style={{ display: 'grid', gap: 8 }}>
                {activity.faq.map((item: { question: string; answer: string }, i: number) => (
                  <details key={i} style={{ background: '#fff', border: '1px solid var(--tp-border)', borderRadius: 10, padding: '10px 14px' }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{item.question}</summary>
                    <p style={{ marginTop: 8, color: 'var(--tp-muted)', lineHeight: 1.6 }}>{item.answer}</p>
                  </details>
                ))}
              </div>
            </section>
          )}

          {/* Refund rules */}
          {activity.refundRules?.length > 0 && (
            <section className="tp-detail-block" style={{ marginBottom: 24 }}>
              <h2>取消與退款政策</h2>
              <ul style={{ paddingLeft: 18, lineHeight: 2, color: 'var(--tp-muted)' }}>
                {activity.refundRules.map((r: string, i: number) => <li key={i}>{r}</li>)}
              </ul>
            </section>
          )}

          {/* Reviews */}
          {actReviews.length > 0 && (
            <section className="tp-detail-block">
              <h2>旅客評價</h2>
              <p style={{ marginBottom: 14 }}>⭐ {guide?.ratingAvg?.toFixed(1) || '5.0'} · 共 {actReviews.length} 則評價</p>
              <div style={{ display: 'grid', gap: 12 }}>
                {actReviews.map((r: any) => (
                  <div key={r.id} style={{ background: 'var(--tp-bg-soft)', border: '1px solid var(--tp-border)', borderRadius: 10, padding: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <strong>{r.author}{r.city ? `（${r.city}）` : ''}</strong>
                      <span style={{ color: 'var(--tp-muted)', fontSize: 13 }}>{r.date || r.createdAt?.slice(0, 10)}</span>
                    </div>
                    <p style={{ color: '#f5a623', margin: '0 0 6px' }}>{'★'.repeat(r.rating)}</p>
                    <p style={{ margin: 0, lineHeight: 1.6 }}>{r.text || r.comment}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </article>

        {/* Booking sidebar */}
        <aside className="tp-activity-booking-side" style={{ position: 'sticky', top: 80, height: 'fit-content' }}>
          <div style={{ border: '1px solid var(--tp-border)', borderRadius: 12, padding: 20 }}>
            <p style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>
              起價 NT${activity.priceTwd?.toLocaleString()} / 人
            </p>

            <label style={{ display: 'block', marginTop: 14, fontSize: 14, fontWeight: 700 }}>
              選擇日期
              <input type="date" style={{ display: 'block', width: '100%', padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 10, marginTop: 4 }} />
            </label>

            {/* Available schedules */}
            {displayedSchedules.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>近期可預約場次：</p>
                {displayedSchedules.map((s: any, i: number) => {
                  const startAt = s.startAt || s.start_at;
                  const capacity = Number(s.capacity || 0);
                  const bookedCount = Number(s.bookedCount ?? s.booked_count ?? 0);
                  const status = s.status || (bookedCount >= capacity ? 'full' : 'open');
                  const d = new Date(startAt);
                  const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
                  const remaining = capacity - bookedCount;
                  return (
                    <div key={s.id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>
                      <span>{dateStr}（{['日','一','二','三','四','五','六'][d.getDay()]}）</span>
                      {status === 'full'
                        ? <span style={{ color: '#e53e3e', fontWeight: 700 }}>已額滿</span>
                        : <span style={{ color: 'var(--tp-primary)' }}>剩 {remaining} 位</span>
                      }
                    </div>
                  );
                })}
              </div>
            )}

            <label style={{ display: 'block', marginTop: 14, fontSize: 14, fontWeight: 700 }}>
              參加人數
              <input type="number" defaultValue={2} min={1} max={activity.maxParticipants || 10} style={{ display: 'block', width: '100%', padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 10, marginTop: 4 }} />
            </label>

            <p style={{ fontSize: 18, fontWeight: 700, marginTop: 14 }}>總計：NT${((activity.priceTwd || 0) * 2).toLocaleString()}</p>

            <Link href={`/booking/${activity.slug}`} className="tp-btn tp-btn-primary" style={{ width: '100%', display: 'block', textAlign: 'center', marginTop: 12, fontSize: 16, padding: '14px 0' }}>
              立即預約
            </Link>
            <button className="tp-btn tp-btn-ghost" style={{ width: '100%', marginTop: 8 }}>✉️ 詢問導遊</button>

            <div style={{ marginTop: 16, fontSize: 13, color: 'var(--tp-muted)', lineHeight: 1.8 }}>
              <p>🔒 安全付款（ECPay / LINE Pay）</p>
              <p>✅ 免費取消（依各行程政策）</p>
              <p>📞 緊急熱線 30 分鐘回應</p>
              <p>✅ 實名認證導遊</p>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
