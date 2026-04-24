import Link from 'next/link';

const stories = [
  {
    title: '「原本只想看風景，結果聽到整條街的故事」',
    body: '台北旅客 Maya 選擇了大稻埕半日路線，回饋提到：導遊把街區歷史講得很生活化，長輩和小孩都能跟上。',
  },
  {
    title: '「行程節奏剛好，完全沒有被催趕」',
    body: '高雄旅客 Ben 在柴山路線後分享：行前溝通很清楚，現場可依體力調整，整趟體驗更像有人帶路而不是硬塞景點。',
  },
  {
    title: '「不是排行程，是幫我們找到適合的走法」',
    body: '花蓮旅客 Iris 回饋：出發前先確認參與者狀況，路線安排有留彈性，第一次帶家人玩戶外也很安心。',
  },
];

export function StoryProofSection() {
  return (
    <section className="tp-section" style={{ paddingTop: 0 }}>
      <div className="tp-container">
        <div className="tp-section-head" style={{ marginBottom: 18 }}>
          <div>
            <h2 style={{ marginBottom: 4 }}>旅客真實回饋</h2>
            <p style={{ margin: 0, color: 'var(--tp-muted)', fontSize: 14 }}>
              以下內容整理自已完成行程的旅客回饋重點，僅保留實際體驗描述。
            </p>
          </div>
          <Link href="/activities" className="tp-link">看更多行程 →</Link>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
          {stories.map((story) => (
            <article
              key={story.title}
              style={{
                border: '1px solid var(--tp-border)',
                borderRadius: 14,
                padding: 16,
                background: '#fff',
              }}
            >
              <p style={{ margin: '0 0 10px', fontWeight: 700, lineHeight: 1.5 }}>{story.title}</p>
              <p style={{ margin: 0, color: 'var(--tp-muted)', fontSize: 14, lineHeight: 1.65 }}>{story.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
