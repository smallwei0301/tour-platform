'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  SCENE_DEPTH,
  activeSceneIndex,
  cameraZ,
  copyOpacity,
  progressForScene,
  sceneDistance,
  sceneOpacity,
} from '../../lib/scroll-world/camera.mjs';
import { SceneArt } from './SceneArt';
import styles from './scroll-world.module.css';

/** 由 server page 以 i18n 解析後傳入的單景資料。 */
export type SceneView = {
  id: string;
  art: string;
  accent: string;
  href: string;
  eyebrow: string;
  title: string;
  body: string;
  tags: string[];
  cta: string;
};

type Props = {
  scenes: SceneView[];
  hint: string;
  progressLabel: string;
};

/** 每個「節奏單位」（linger＋travel）分配的滾動幅度（vh）。 */
const SCROLL_PER_SCENE_VH = 150;

/**
 * /world 的 3D 滾動引擎（scroll-world scrub 引擎的 CSS 3D 等價物）。
 *
 * 滾動進度（sticky 舞台在 tall 容器內的位置）→ cameraZ() → world 的
 * translateZ。場景排在 Z 軸負向（第 i 景在 -i * SCENE_DEPTH），相機只
 * 前進不回拉；穿越時 near 層放大掠過鏡頭即「飛入場景內部」。
 * 每幀更新走 rAF＋直接改 style，不觸發 React re-render（僅 active index
 * 變化時 setState，驅動文案與導軌）。
 */
export function ScrollWorldClient({ scenes, hint, progressLabel }: Props) {
  const n = scenes.length;
  const rootRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const tintRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
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
      const world = worldRef.current;
      if (!root || !world) return;
      const rect = root.getBoundingClientRect();
      const viewport = window.innerHeight;
      const scrollable = rect.height - viewport;
      const progress = scrollable > 0 ? Math.min(1, Math.max(0, -rect.top / scrollable)) : 0;
      const z = cameraZ(progress, n);

      world.style.transform = `translateZ(${z.toFixed(2)}px)`;
      for (let i = 0; i < n; i += 1) {
        const sceneEl = sceneRefs.current[i];
        if (sceneEl) {
          const opacity = sceneOpacity(sceneDistance(z, i));
          sceneEl.style.opacity = opacity.toFixed(3);
          sceneEl.style.visibility = opacity <= 0.001 ? 'hidden' : 'visible';
        }
        const copyEl = copyRefs.current[i];
        if (copyEl) {
          const opacity = copyOpacity(z, i);
          copyEl.style.opacity = opacity.toFixed(3);
          copyEl.style.pointerEvents = opacity > 0.5 ? 'auto' : 'none';
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
              <SceneArt art={scene.art} />
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
          <div ref={worldRef} className={styles.world}>
            {scenes.map((scene, i) => (
              <div
                key={scene.id}
                ref={(el) => {
                  sceneRefs.current[i] = el;
                }}
                className={styles.scene}
                style={{
                  transform: `translateZ(${-i * SCENE_DEPTH}px)`,
                  opacity: i === 0 ? 1 : 0,
                  visibility: i === 0 ? 'visible' : 'hidden',
                }}
                aria-hidden="true"
              >
                <SceneArt art={scene.art} />
              </div>
            ))}
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
