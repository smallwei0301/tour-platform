'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  activeSceneIndex,
  cameraZ,
  clipProgress,
  copyOpacity,
  preludeProgress,
  progressForScene,
  sceneDistance,
  sceneOpacity,
  sceneScale,
} from '../../lib/scroll-world/camera.mjs';
import { SCROLL_WORLD_PRELUDE } from '../../lib/scroll-world/scenes.mjs';
import styles from './scroll-world.module.css';

/** 由 server page 以 i18n 解析後傳入的單景資料。 */
export type SceneView = {
  id: string;
  still: string;
  clip: string | null;
  accent: string;
  href: string;
  eyebrow: string;
  title: string;
  body: string;
  tags: string[];
  cta: string;
};

/**
 * 場景媒體：AI 生成的黏土微景觀主圖當 billboard；相機沿 Z 軸飛向它即
 * scroll-world 的「飛入場景」。有 clip 時疊一層 muted 影片，由引擎以
 * scrub（滾動進度＝currentTime）驅動——影片恆為 paused、不自動播放；
 * still（＝影片第 0 幀構圖）當 poster 與 reduced-motion fallback。
 */
function SceneMedia({ scene }: { scene: SceneView }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- billboard 需鋪滿 3D 平面，不走 next/image 版面 */}
      <img className={styles.still} src={scene.still} alt="" aria-hidden="true" draggable={false} width={1600} height={900} />
      {scene.clip && (
        <video
          className={styles.clip}
          poster={scene.still}
          muted
          playsInline
          // metadata 即滿足 scrub 引擎的 readyState>=1 門檻；幀資料改為 seek 時
          // 漸進抓取（range request），未就緒時由同構圖 poster 補位——避免
          // preload="auto" 讓首頁一次抓滿 7 支影片（~14.6MB）。
          preload="metadata"
          aria-hidden="true"
        >
          {/* VP9/WebM 給 Chrome/Firefox/Android，H.264/mp4 給 Safari/iOS */}
          <source src={scene.clip.replace(/\.mp4$/, '.webm')} type="video/webm" />
          <source src={scene.clip} type="video/mp4" />
        </video>
      )}
    </>
  );
}

type Props = {
  scenes: SceneView[];
  hint: string;
  progressLabel: string;
};

/** 每個「節奏單位」（linger＋travel）分配的滾動幅度（vh）。 */
const SCROLL_PER_SCENE_VH = 150;

/** 序章平移量（元素寬高 %）：讓 origin（燈籠）在拉近結束時落在 target（涼亭）。 */
const PRELUDE_SHIFT = (() => {
  const pct = (value: string) => value.split(' ').map((v) => parseFloat(v));
  const [ox, oy] = pct(SCROLL_WORLD_PRELUDE.origin);
  const [tx, ty] = pct(SCROLL_WORLD_PRELUDE.target);
  return { x: tx - ox, y: ty - oy };
})();

/**
 * `/`（祕島世界）的滾動引擎（scroll-world scrub 引擎的全幅淡化版）。
 *
 * 滾動進度（sticky 舞台在 tall 容器內的位置）→ cameraZ()（虛擬時間軸，
 * 只前進不回拉）。場景為全幅 billboard：以對稱交叉淡化轉場（sceneOpacity，
 * 相鄰兩景總和恆 1）＋恆 ≥1 的細微縮放漂移（sceneScale，絕不露出邊框）；
 * 「飛入」感由影片本身的鏡頭運動（scrub）承擔，不再做會露邊框的 3D 縮放。
 * 每幀更新走 rAF＋直接改 style，不觸發 React re-render（僅 active index
 * 變化時 setState，驅動文案與導軌）。
 */
export function ScrollWorldClient({ scenes, hint, progressLabel }: Props) {
  const n = scenes.length;
  const rootRef = useRef<HTMLDivElement>(null);
  const tintRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const preludeRef = useRef<HTMLDivElement>(null);
  const sceneRefs = useRef<Array<HTMLDivElement | null>>([]);
  const copyRefs = useRef<Array<HTMLDivElement | null>>([]);
  const activeIndexRef = useRef(0);
  const [active, setActive] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReducedMotion(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    let raf = 0;

    const update = () => {
      raf = 0;
      const root = rootRef.current;
      if (!root) return;
      const rect = root.getBoundingClientRect();
      const viewport = window.innerHeight;
      const scrollable = rect.height - viewport;
      const progress = scrollable > 0 ? Math.min(1, Math.max(0, -rect.top / scrollable)) : 0;
      const z = cameraZ(progress, n);

      for (let i = 0; i < n; i += 1) {
        const sceneEl = sceneRefs.current[i];
        if (sceneEl) {
          const distance = sceneDistance(z, i);
          const opacity = sceneOpacity(distance);
          sceneEl.style.opacity = opacity.toFixed(3);
          sceneEl.style.visibility = opacity <= 0.001 ? 'hidden' : 'visible';
          sceneEl.style.transform = `scale(${sceneScale(distance).toFixed(4)})`;
          // scroll-world scrub：滾動進度＝影片播放進度（影片恆為 paused，
          // 以 currentTime 對齊章節進度）。章節切在過場中點——出景影片在
          // 交叉淡化處播到最後一幀（拉遠），入景影片從第 0 幀（遠景）拉近。
          // 不做可見度守衛：隱藏景的章節值是 clamp 常數（0 或 1），對齊一次
          // 後 diff=0 零成本；快速跳景（導軌點擊）時出景影片才不會凍在半路。
          const video = sceneEl.querySelector('video');
          if (video) {
            if (!video.paused) video.pause();
            if (video.readyState >= 1 && Number.isFinite(video.duration)) {
              const target = Math.min(video.duration - 0.05, clipProgress(progress, i, n) * video.duration);
              if (Math.abs(video.currentTime - target) > 0.033) video.currentTime = target;
            }
          }
        }
        const copyEl = copyRefs.current[i];
        if (copyEl) {
          const opacity = copyOpacity(z, i);
          copyEl.style.opacity = opacity.toFixed(3);
          copyEl.style.pointerEvents = opacity > 0.5 ? 'auto' : 'none';
        }
      }
      // 開場序章：島嶼全景向燈籠拉近（smoothstep 緩動）＋平移，讓燈籠
      // 落在首景影片第 0 幀涼亭的位置，末段淡出溶接（同主體同亮點接手）。
      const prelude = preludeRef.current;
      if (prelude) {
        const pp = preludeProgress(progress, n);
        if (pp >= 1) {
          prelude.style.visibility = 'hidden';
        } else {
          const eased = pp * pp * (3 - 2 * pp);
          prelude.style.visibility = 'visible';
          prelude.style.transform = `translate(${(PRELUDE_SHIFT.x * eased).toFixed(2)}%, ${(PRELUDE_SHIFT.y * eased).toFixed(2)}%) scale(${(1 + (SCROLL_WORLD_PRELUDE.zoom - 1) * eased).toFixed(4)})`;
          prelude.style.opacity = (pp < 0.55 ? 1 : 1 - (pp - 0.55) / 0.45).toFixed(3);
        }
      }

      if (hintRef.current) hintRef.current.style.opacity = progress > 0.02 ? '0' : '1';

      const index = activeSceneIndex(z, n);
      if (index !== activeIndexRef.current) {
        activeIndexRef.current = index;
        setActive(index);
        if (tintRef.current) tintRef.current.style.backgroundColor = scenes[index].accent;
      }
    };

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    if (tintRef.current) tintRef.current.style.backgroundColor = scenes[activeIndexRef.current].accent;
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [n, scenes, reducedMotion]);

  const jumpTo = (index: number) => {
    const root = rootRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const scrollable = rect.height - window.innerHeight;
    const top = window.scrollY + rect.top + progressForScene(index, n) * Math.max(0, scrollable);
    window.scrollTo({ top, behavior: 'smooth' });
  };

  if (reducedMotion) {
    // 平面 fallback：無 3D 飛行，逐景直列（內容與 CTA 完整保留）。
    return (
      <div className={`sw-root ${styles.root}`}>
        {scenes.map((scene) => (
          <section key={scene.id} className={styles.flatScene} aria-label={scene.title}>
            <div className={styles.flatArt} aria-hidden="true">
              {/* eslint-disable-next-line @next/next/no-img-element -- 全幅背景圖，非 next/image 版面 */}
              <img className={styles.still} src={scene.still} alt="" aria-hidden="true" draggable={false} width={1600} height={900} />
            </div>
            <div className={styles.flatCopy}>
              <SceneCopy scene={scene} headingLevel={scene.id === 'intro' ? 'h1' : 'h2'} />
            </div>
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className={`sw-root ${styles.root}`}>
      <div ref={rootRef} className={styles.tall} style={{ height: `${n * SCROLL_PER_SCENE_VH}vh` }}>
        <div className={styles.stage}>
          <div ref={tintRef} className={styles.tint} style={{ backgroundColor: scenes[0].accent }} />
          <div className={styles.world}>
            {scenes.map((scene, i) => (
              <div
                key={scene.id}
                ref={(el) => {
                  sceneRefs.current[i] = el;
                }}
                className={styles.scene}
                style={{
                  opacity: i === 0 ? 1 : 0,
                  visibility: i === 0 ? 'visible' : 'hidden',
                }}
                aria-hidden="true"
              >
                <SceneMedia scene={scene} />
              </div>
            ))}
          </div>
          <div
            ref={preludeRef}
            className={styles.prelude}
            style={{ transformOrigin: SCROLL_WORLD_PRELUDE.origin }}
            aria-hidden="true"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- 全幅序章圖 */}
            <img className={styles.still} src={SCROLL_WORLD_PRELUDE.still} alt="" draggable={false} width={1600} height={900} />
          </div>
          <div className={styles.vignette} />
          {scenes.map((scene, i) => (
            <div
              key={scene.id}
              ref={(el) => {
                copyRefs.current[i] = el;
              }}
              className={styles.copy}
              style={{ opacity: i === 0 ? 1 : 0, pointerEvents: i === 0 ? 'auto' : 'none' }}
            >
              <SceneCopy scene={scene} headingLevel={i === 0 ? 'h1' : 'h2'} />
            </div>
          ))}
          <nav className={styles.rail} aria-label={progressLabel}>
            {scenes.map((scene, i) => (
              <button
                key={scene.id}
                type="button"
                className={`${styles.railDot}${i === active ? ` ${styles.railDotActive}` : ''}`}
                aria-label={scene.title}
                aria-current={i === active ? 'true' : undefined}
                onClick={() => jumpTo(i)}
              />
            ))}
          </nav>
          <div ref={hintRef} className={styles.hint} aria-hidden="true">
            <span>{hint}</span>
            <svg className={styles.hintChevron} width="16" height="10" viewBox="0 0 16 10" fill="none" aria-hidden="true">
              <path d="M1 1l7 7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

function SceneCopy({ scene, headingLevel }: { scene: SceneView; headingLevel: 'h1' | 'h2' }) {
  const Heading = headingLevel;
  return (
    <>
      <span className={styles.copyEyebrow} style={{ color: scene.accent }}>
        {scene.eyebrow}
      </span>
      <Heading className={styles.copyTitle}>{scene.title}</Heading>
      <p className={styles.copyBody}>{scene.body}</p>
      {scene.tags.length > 0 && (
        <ul className={styles.copyTags}>
          {scene.tags.map((tag) => (
            <li key={tag} className={styles.copyTag}>
              {tag}
            </li>
          ))}
        </ul>
      )}
      <Link className={styles.copyCta} href={scene.href} style={{ backgroundColor: scene.accent }}>
        {scene.cta} →
      </Link>
    </>
  );
}
