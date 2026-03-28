import Link from 'next/link';
import { activities, guides } from '../../src/fixtures/data';

export default function ActivitiesPage() {
  return (
    <main className="tp-container tp-activities" style={{ paddingBottom: 40 }}>
      <div className="tp-breadcrumb">首頁 &gt; 全部行程</div>
      <section className="tp-activities-layout">
        <aside className="tp-filter">
          <div className="tp-filter-head">
            <h3>篩選條件</h3>
            <button>清除全部</button>
          </div>
          <details open>
            <summary>地區</summary>
            <label><input type="checkbox" /> 台北市</label>
            <label><input type="checkbox" /> 高雄市</label>
            <label><input type="checkbox" /> 花蓮縣</label>
            <label><input type="checkbox" /> 台南市</label>
          </details>
          <details open>
            <summary>行程主題</summary>
            <label><input type="checkbox" /> 文化歷史</label>
            <label><input type="checkbox" /> 美食體驗</label>
            <label><input type="checkbox" /> 戶外冒險</label>
            <label><input type="checkbox" /> 柴山探洞 🔦</label>
            <label><input type="checkbox" /> 溯溪 🌊</label>
          </details>
          <details>
            <summary>行程時長</summary>
            <label><input type="checkbox" /> 2 小時以內</label>
            <label><input type="checkbox" /> 2～4 小時</label>
            <label><input type="checkbox" /> 4～8 小時（半天）</label>
            <label><input type="checkbox" /> 8 小時以上（全天）</label>
          </details>
          <details>
            <summary>語言</summary>
            <label><input type="checkbox" /> 中文</label>
            <label><input type="checkbox" /> 英語</label>
            <label><input type="checkbox" /> 日語</label>
            <label><input type="checkbox" /> 德語</label>
          </details>
          <details>
            <summary>特殊條件</summary>
            <label><input type="checkbox" /> ✅ 認證導遊</label>
            <label><input type="checkbox" /> 可退款</label>
            <label><input type="checkbox" /> 👨‍👩‍👦 親子友善</label>
          </details>
        </aside>

        <section>
          <div className="tp-result-head">
            <h2>全台灣 {activities.length} 個私人導遊行程</h2>
            <select aria-label="排序">
              <option>推薦排序</option>
              <option>價格：低到高</option>
              <option>價格：高到低</option>
              <option>評分：高到低</option>
              <option>最新上架</option>
            </select>
          </div>

          <div className="tp-card-grid tp-card-grid-activities">
            {activities.map((a) => {
              const guide = guides.find((g) => g.slug === a.guideSlug);
              return (
                <article className="tp-card" key={a.slug}>
                  <div style={{ position: 'relative' }}>
                    <img
                      src={a.imageUrl}
                      alt={a.title}
                      className="tp-card-img"
                      style={{ background: 'none' }}
                      loading="lazy"
                    />
                    <button className="tp-fav-btn" aria-label="收藏">❤️</button>
                  </div>
                  {guide && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0 4px' }}>
                      <img src={guide.avatarUrl} alt={guide.displayName} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
                      <span style={{ fontSize: 13, color: 'var(--tp-muted)' }}>您的導遊：{guide.displayName} ✅</span>
                    </div>
                  )}
                  <h3>{a.title}</h3>
                  <p>⭐ 5.0</p>
                  <p>🕐 {a.durationDisplay} · {a.transportMode} · 👥 {a.minParticipants}~{a.maxParticipants} 人</p>
                  <p>📍 {a.region}</p>
                  <strong style={{ color: 'var(--tp-primary)' }}>起價 {a.priceLabel}</strong>
                  <Link className="tp-link" href={`/activities/${a.regionSlug}/${a.slug}`}>查看行程 →</Link>
                </article>
              );
            })}
          </div>
        </section>
      </section>
    </main>
  );
}
