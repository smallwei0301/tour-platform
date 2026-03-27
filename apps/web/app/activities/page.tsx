import Link from 'next/link';

const cards = [
  { slug: 'chaishan-cave-tour', title: '高雄柴山自然公園探洞半日遊', rating: '5.0 (6)', meta: '🕐 4小時 · 🚶 步行 · 👥 1~6', region: '高雄市', price: 'NT$1,800' },
  { slug: 'dadadaocheng-walk', title: '大稻埕百年老街深度漫步', rating: '5.0 (12)', meta: '🕐 3小時 · 🚶 步行 · 👥 1~8', region: '台北市', price: 'NT$1,500' },
  { slug: 'hualien-river', title: '花蓮秀姑巒溪溯溪全日冒險', rating: '5.0 (14)', meta: '🕐 全天 · 🚐 包車 · 👥 1~8', region: '花蓮縣', price: 'NT$3,200' },
  { slug: 'tainan-food', title: '台南府城美食探索路線', rating: '4.9 (9)', meta: '🕐 4小時 · 🛵 機車 · 👥 1~4', region: '台南市', price: 'NT$1,200' }
];

export default function ActivitiesPage() {
  return (
    <main className="tp-container tp-activities">
      <div className="tp-breadcrumb">首頁 &gt; 全部行程</div>
      <section className="tp-activities-layout">
        <aside className="tp-filter">
          <div className="tp-filter-head">
            <h3>篩選條件</h3>
            <button>清除</button>
          </div>

          <details open>
            <summary>地區</summary>
            <label><input type="checkbox"/> 台北市（42）</label>
            <label><input type="checkbox"/> 高雄市（15）</label>
            <label><input type="checkbox"/> 花蓮縣（28）</label>
            <label><input type="checkbox"/> 台南市（19）</label>
          </details>

          <details open>
            <summary>行程主題</summary>
            <label><input type="checkbox"/> 文化歷史</label>
            <label><input type="checkbox"/> 美食體驗</label>
            <label><input type="checkbox"/> 戶外冒險</label>
            <label><input type="checkbox"/> 柴山探洞</label>
          </details>

          <details>
            <summary>語言</summary>
            <label><input type="checkbox"/> 中文</label>
            <label><input type="checkbox"/> 英語</label>
            <label><input type="checkbox"/> 日語</label>
          </details>
        </aside>

        <section>
          <div className="tp-result-head">
            <h2>全台灣 42 個私人導遊行程</h2>
            <select aria-label="排序">
              <option>推薦排序</option>
              <option>價格：低到高</option>
              <option>價格：高到低</option>
              <option>評分：高到低</option>
            </select>
          </div>

          <div className="tp-card-grid tp-card-grid-activities">
            {cards.map((c) => (
              <article className="tp-card" key={c.slug}>
                <div className="tp-card-img" />
                <h3>{c.title}</h3>
                <p>⭐ {c.rating}</p>
                <p>{c.meta}</p>
                <p>📍 {c.region}</p>
                <strong>起價 {c.price}</strong>
                <Link className="tp-link" href={`/experiences/${c.slug}`}>查看行程 →</Link>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
