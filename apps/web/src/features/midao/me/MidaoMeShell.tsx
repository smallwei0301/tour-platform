export function MidaoMeShell() {
  return (
    <section className="midao-me-screen" aria-labelledby="midao-me-title">
      <div className="midao-me-intro">
        <p className="midao-me-eyebrow">我的祕島</p>
        <h2 id="midao-me-title" className="midao-heading">我的頁面</h2>
        <p className="midao-me-description">慢慢整理你的旅程節奏，讓重要的日常留在同一個地方。</p>
      </div>

      <section className="midao-me-capabilities" aria-label="能力中心">
        <h3>能力中心</h3>
        <div className="midao-me-card-grid">
          <article className="midao-me-card">
            <p className="midao-me-card__status">即將推出</p>
            <h4>個人節奏</h4>
            <p>為你的旅程整理想記住的方向與提醒。</p>
          </article>
          <article className="midao-me-card">
            <p className="midao-me-card__status">即將推出</p>
            <h4>旅程足跡</h4>
            <p>回看那些讓你想再次出發的片刻。</p>
          </article>
          <article className="midao-me-card">
            <p className="midao-me-card__status">即將推出</p>
            <h4>祕島偏好</h4>
            <p>保留你在意的自然、故事與地方生活。</p>
          </article>
        </div>
      </section>
    </section>
  );
}
