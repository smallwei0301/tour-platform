'use client';

import { useEffect, useRef } from 'react';

/**
 * 丁達爾光束中的懸浮微粒（dust motes）— canvas 粒子系統。
 *
 * 物理模型（遵守真實懸浮微粒行為，尺寸刻意放大以利可見）：
 * - 布朗運動：速度採 Ornstein–Uhlenbeck 過程（隨機加速度＋阻尼回歸），
 *   呈現真實塵埃「彈道—擴散」的抖動游走，而非直線或正弦路徑
 * - 對流上飄：基線速度向上（光束加熱空氣的微對流），個別粒子略有差異
 * - 散射閃爍：粒子隨機翻轉導致散射截面變化 → 不規則明滅（相位/頻率隨機）
 * - 景深：粒徑與模糊度隨機（近大遠小、失焦光斑）
 * - 只在光照範圍可見：粒子佈於光束扇形（196°–257°、原點＝右上角光源），
 *   canvas 再以與光束相同的 radial mask 淡出 — 光照不到的塵埃不可見
 * - 與光束同步呼吸：每幀讀 .lp-hero-rays 的 computed opacity，粉塵散射
 *   強度跟著光束明暗 — 光束最亮時粉塵最明顯、光束暗下時粉塵消失
 */

const ORIGIN_X = 1.0; // 後景最右上角（與 .lp-hero-rays 的 conic 原點一致）
const ORIGIN_Y = 0.0;
const FAN_FROM = 196;  // 光束扇形角度範圍（CSS conic 角度：0°=上、順時針）
const FAN_TO = 257;
const COUNT = 230; // 密度 ×5

type Mote = {
  x: number; y: number;
  vx: number; vy: number;
  size: number;
  blur: number;
  phase: number;
  flicker: number;
  baseAlpha: number;
};

function spawnMote(w: number, h: number, anywhere: boolean): Mote {
  // 在光束扇形內以極座標取樣（角度均勻、半徑偏向光束中段）
  const deg = FAN_FROM + Math.random() * (FAN_TO - FAN_FROM);
  const th = (deg * Math.PI) / 180;
  const maxR = Math.hypot(w, h) * 0.95;
  const r = (anywhere ? Math.random() : 0.55 + Math.random() * 0.45) * maxR;
  return {
    x: ORIGIN_X * w + Math.sin(th) * r,
    y: ORIGIN_Y * h - Math.cos(th) * r,
    vx: (Math.random() - 0.5) * 6,
    vy: -(3 + Math.random() * 8), // 向上飄
    // 體積縮為 1/10（半徑 ÷∛10 ≈ 2.15）
    size: 0.33 + Math.random() * 1.12,
    blur: Math.random() < 0.35 ? 1 + Math.random() * 1.6 : 0.3,
    phase: Math.random() * Math.PI * 2,
    flicker: 0.6 + Math.random() * 2.2,
    baseAlpha: 0.35 + Math.random() * 0.5,
  };
}

export function LpHeroDust() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = 0, h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const motes: Mote[] = Array.from({ length: COUNT }, () => spawnMote(w, h, true));

    const raysEl = document.querySelector('.lp-hero-rays');

    let raf = 0;
    let last = performance.now();
    let t = 0;
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now; t += dt;
      ctx.clearRect(0, 0, w, h);
      // 與光束同步：光束 opacity 0.3（最暗）→粉塵≈0；0.95（最亮）→全強度
      const raysOpacity = raysEl ? parseFloat(getComputedStyle(raysEl).opacity) || 0 : 1;
      const beamSync = Math.min(1, Math.max(0.04, (raysOpacity - 0.3) / 0.65));
      for (let i = 0; i < motes.length; i++) {
        const m = motes[i];
        // Ornstein–Uhlenbeck：隨機加速度（布朗擾動）＋阻尼回歸基線（0, -5）
        const sigma = 380; // 布朗運動幅度 ×10
        m.vx += (0 - m.vx) * 0.9 * dt + (Math.random() - 0.5) * sigma * dt;
        m.vy += (-5 - m.vy) * 0.9 * dt + (Math.random() - 0.5) * sigma * dt;
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        // 飄出光束範圍 → 於扇形內重生
        const dx = m.x - ORIGIN_X * w, dy = m.y - ORIGIN_Y * h;
        const rr = Math.hypot(dx, dy);
        const ang = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360; // CSS conic 角
        if (m.y < -8 || rr > Math.hypot(w, h) || ang < FAN_FROM - 8 || ang > FAN_TO + 8) {
          motes[i] = spawnMote(w, h, false);
          continue;
        }
        // 散射閃爍（隨機翻轉的不規則明滅）＋距光源越遠越淡
        const tw = 0.5 + 0.5 * Math.sin(t * m.flicker * 2 + m.phase) * Math.sin(t * 0.7 + m.phase * 1.7);
        const fall = Math.max(0, 1 - rr / (Math.hypot(w, h) * 0.95));
        const alpha = m.baseAlpha * (0.35 + 0.65 * tw) * (0.3 + 0.7 * fall) * beamSync;
        if (alpha <= 0.01) continue;
        ctx.beginPath();
        ctx.shadowColor = 'rgba(255, 240, 205, 0.9)';
        ctx.shadowBlur = m.blur * 3;
        ctx.fillStyle = `rgba(255, 244, 214, ${alpha})`;
        ctx.arc(m.x, m.y, m.size, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={ref} className="lp-hero-dust" aria-hidden="true" data-testid="lp-hero-dust" />;
}
