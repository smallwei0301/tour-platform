import Link from 'next/link';

const tours = [
  { slug: 'chaishan-cave-tour', title: '高雄柴山自然公園探洞半日遊', meta: '🕐 4小時 · 🚶 步行 · 👥 1~6人', price: '起價 NT$1,800' },
  { slug: 'dadadaocheng-walk', title: '大稻埕百年老街深度漫步', meta: '🕐 3小時 · 🚶 步行 · 👥 1~8人', price: '起價 NT$1,500' },
  { slug: 'hualien-river', title: '花蓮秀姑巒溪溯溪全日冒險', meta: '🕐 全天 · 🚐 包車 · 👥 1~8人', price: '起價 NT$3,200' }
];

export function FeaturedTours() {
  return (
    <section className="tp-section">
      <div className="tp-container">
        <div className="tp-section-head">
          <h2>精選在地導遊行程</h2>
          <Link href="/activities">查看全部</Link>
        </div>
        <div className="tp-card-grid">
          {tours.map((tour) => (
            <article key={tour.slug} className="tp-card">
              <div className="tp-card-img" />
              <h3>{tour.title}</h3>
              <p>{tour.meta}</p>
              <strong>{tour.price}</strong>
              <Link className="tp-link" href={`/experiences/${tour.slug}`}>查看行程 →</Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
