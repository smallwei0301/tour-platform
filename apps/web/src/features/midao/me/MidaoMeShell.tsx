import { MidaoMeCapabilityCenter } from './MidaoMeCapabilityCenter';

export function MidaoMeShell() {
  return (
    <section className="midao-me-screen" aria-labelledby="midao-me-title">
      <div className="midao-me-intro">
        <p className="midao-me-eyebrow">我的祕島</p>
        <h2 id="midao-me-title" className="midao-heading">我的頁面</h2>
        <p className="midao-me-description">慢慢整理你的旅程節奏，讓重要的日常留在同一個地方。</p>
      </div>

      <MidaoMeCapabilityCenter />
    </section>
  );
}
