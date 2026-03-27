import Link from 'next/link';

export function ThemeCtas() {
  return (
    <section className="tp-container tp-theme-stack">
      <article className="tp-theme tp-theme-cave">
        <h3>鑽進高雄的秘密地下世界</h3>
        <p>柴山石灰岩洞穴藏著億萬年地質故事，讓在地導遊帶你安全進洞。</p>
        <Link href="/theme/cave-exploration">探索柴山行程 →</Link>
      </article>
      <article className="tp-theme tp-theme-river">
        <h3>走進台灣最純淨的野溪</h3>
        <p>不靠纜車、不靠觀光車，靠雙腳和真正懂山的人，看見台灣本質。</p>
        <Link href="/theme/river-trekking">探索溯溪行程 →</Link>
      </article>
    </section>
  );
}
