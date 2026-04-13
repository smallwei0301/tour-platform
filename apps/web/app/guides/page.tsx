import Link from 'next/link';
import { listPublishedGuidesDb } from '../../src/lib/db.mjs'";

export default async function GuidesPage() {
  const guides = await listPublishedGuidesDb().catch(() => []);

  return (
    <main className="tp-container tp-guides-page" style={{ paddingBottom: 40 }}>
      <div className="tp-breadcrumb">首頁 &gt; 全部導遊</div>
      <section className="tp-activities-layout">
        <aside className="tp-filter">
          <div className="tp-filter-head">
            <h3>導遊篩選</h3>
            <button>清除</button>
          </div>
          <details open>
            <summary>縣市</summary>
            <label><input type="checkbox" /> 台北市</label>
            <label><input type="checkbox" /> 高雄市</label>
            <label><input type="checkbox" /> 花蓮縣</label>
          </details>
          <details open>
            <summary>語言</summary>
            <label><input type="checkbox" /> 英語導覽</label>
            <label><input type="checkbox" /> 日語導覽</label>
            <label><input type="checkbox" /> 德語導覽</label>
          </details>
          <details open>
            <summary>主題專長</summary>
            <label><input type="checkbox" /> 文化歷史</label>
            <label><input type="checkbox" /> 美食體驗</label>
            <label><input type="checkbox" /> 戶外冒險</label>
            <label><input type="checkbox" /> 柴山探洞 🔦</label>
            <label><input type="checkbox" /> 溯溪 🌊</label>
          </details>
          <details>
            <summary>特殊認證</summary>
            <label><input type="checkbox" /> ✅ KYC 已驗證</label>
            <label><input type="checkbox" /> 🏆 精選導遊</label>
          </details>
        </aside>

        <section>
          <div className="tp-result-head">
            <h2>全台灣 {guides.length} 位在地導遊</h2>
            <select>
              <option>推薦排序</option>
              <option>評分高到低</option>
              <option>評價多到少</option>
            </select>
          </div>

          <div className="tp-card-grid tp-card-grid-activities">
            {guides.map((g: any) => (
              <article className="tp-card" key={g.slug}>
                <div style={{ position: 'relative' }}>
                  <img
                    src={g.profilePhotoUrl || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&q=80'}
                    alt={g.displayName}
                    style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover', borderRadius: 10 }}
                    loading="lazy"
                  />
                  <span style={{ position: 'absolute', top: 8, right: 8, background: '#27ae60', color: '#fff', padding: '3px 8px', borderRadius: 6, fontSize: 12 }}>✅ 已驗證</span>
                </div>
                <h3 style={{ marginTop: 10 }}>{g.displayName}</h3>
                <p>⭐ {g.ratingAvg?.toFixed(1) || '5.0'}（{g.reviewCount || 0} 則評價）</p>
                <p>📍 {g.region}</p>
                {g.languages?.length > 0 && <p>🌍 {g.languages.slice(0, 3).join('、')}</p>}
                {g.specialties?.length > 0 && <p style={{ fontSize: 13 }}>{g.specialties.slice(0, 3).join(' · ')}</p>}
                {g.headline && (
                  <p style={{ fontSize: 13, color: 'var(--tp-muted)', fontStyle: 'italic', margin: '6px 0' }}>
                    「{g.headline.length > 40 ? g.headline.slice(0, 40) + '...' : g.headline}」
                  </p>
                )}
                <p style={{ fontSize: 13, color: 'var(--tp-muted)' }}>{g.serviceCount || 0} 次服務</p>
                <Link className="tp-link" href={`/guides/${g.slug}`}>查看導遊簡介 →</Link>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
