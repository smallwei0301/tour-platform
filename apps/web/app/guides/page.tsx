import Link from 'next/link';

const guides = [
  { slug: 'chen-jian-zhi', name: '陳建志', rating: '5.0（47）', city: '台北市', langs: '中文、英語', tags: '文化歷史 · 美食', badge: '✅ 已驗證' },
  { slug: 'lin-a-ming', name: '林阿明', rating: '5.0（14）', city: '花蓮縣', langs: '中文、英語', tags: '戶外冒險 · 溯溪', badge: '🏆 精選導遊' },
  { slug: 'huang-zhi-xiong', name: '黃志雄', rating: '5.0（6）', city: '高雄市', langs: '中文', tags: '柴山探洞 · 生態', badge: '✅ 已驗證' }
];

export default function GuidesPage() {
  return (
    <main className="tp-container tp-guides-page">
      <div className="tp-breadcrumb">首頁 &gt; 全部導遊</div>
      <section className="tp-activities-layout">
        <aside className="tp-filter">
          <div className="tp-filter-head">
            <h3>導遊篩選</h3>
            <button>清除</button>
          </div>
          <details open>
            <summary>縣市</summary>
            <label><input type="checkbox"/> 台北市（18）</label>
            <label><input type="checkbox"/> 花蓮縣（9）</label>
            <label><input type="checkbox"/> 高雄市（15）</label>
          </details>
          <details open>
            <summary>語言</summary>
            <label><input type="checkbox"/> 英語導覽（24）</label>
            <label><input type="checkbox"/> 日語導覽（8）</label>
          </details>
          <details>
            <summary>特殊認證</summary>
            <label><input type="checkbox"/> ✅ KYC 已驗證</label>
            <label><input type="checkbox"/> 🏆 精選導遊</label>
          </details>
        </aside>

        <section>
          <div className="tp-result-head">
            <h2>全台灣導遊</h2>
            <select>
              <option>推薦排序</option>
              <option>評分高到低</option>
              <option>評價多到少</option>
            </select>
          </div>

          <div className="tp-card-grid tp-card-grid-activities">
            {guides.map((g) => (
              <article className="tp-card" key={g.slug}>
                <div className="tp-guide-photo" />
                <p className="tp-guide-badge">{g.badge}</p>
                <h3>{g.name}</h3>
                <p>⭐ {g.rating}</p>
                <p>📍 {g.city}</p>
                <p>🌍 {g.langs}</p>
                <p>{g.tags}</p>
                <Link className="tp-link" href={`/guides/${g.slug}`}>查看導遊簡介 →</Link>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
