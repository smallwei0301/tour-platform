'use client';

import { useEffect } from 'react';

/**
 * Hero 曙光動態驅動器 — 以 Web Animations API（element.animate）驅動，
 * 取代 CSS @keyframes。
 *
 * 為什麼不用 CSS animation：Android Chrome 在「省電模式」或系統
 * 「移除動畫」開啟時會強制 prefers-reduced-motion: reduce；先前以
 * media query 停用動畫的寫法在這些裝置上等於整組失效（使用者只看到
 * 靜態照片）。本元件由 JS 直接驅動，且動畫屬於低前庭風險的氛圍效果
 * （透明度循環、雲層緩慢平移、極慢推近），故不再依 reduced-motion 停用。
 */
export function LpHeroMotion() {
  useEffect(() => {
    const animate = (
      selector: string,
      keyframes: Keyframe[],
      options: KeyframeAnimationOptions,
    ): Animation | null => {
      const el = document.querySelector(selector);
      if (!el || typeof el.animate !== 'function') return null;
      return el.animate(keyframes, options);
    };

    const animations = [
      // 第一視角推進：只放大「去背洞穴前景」（.lp-hero-fg，洞口真 alpha 透明），
      // 遠景山谷（.lp-hero-photo）靜止不動。單程拉近 6150ms 後定住
      //（fill: forwards 保持結束狀態，不再來回推拉）
      animate('.lp-hero-fg',
        [{ transform: 'scale(1)' }, { transform: 'scale(1.16)' }],
        { duration: 6150, iterations: 1, easing: 'ease-out', fill: 'forwards' }),
      // 暮色罩由濃轉淡：照片像被曙光逐漸點亮
      animate('.lp-hero-dawn',
        [{ opacity: 1 }, { opacity: 0 }],
        { duration: 4500, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' }),
      // 丁達爾光束（左下扇形，被洞壁遮擋）：擺動＋呼吸
      animate('.lp-hero-rays',
        [
          { opacity: 0.3, transform: 'rotate(-2deg)' },
          { opacity: 0.95, transform: 'rotate(2deg)' },
        ],
        { duration: 6000, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' }),
      // 左右掃動光帶（光圈）：自洞口區域左右緩慢掃動＋呼吸
      animate('.lp-hero-beam',
        [
          { opacity: 0.25, transform: 'translateX(-6%)' },
          { opacity: 0.75, transform: 'translateX(6%)' },
        ],
        { duration: 6000, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' }),
      // 雲層飄動：平移一個圖樣週期（background-size 50% → -50% 即無縫循環）
      animate('.lp-hero-clouds',
        [{ transform: 'translateX(0)' }, { transform: 'translateX(-50%)' }],
        { duration: 27500, iterations: Infinity, easing: 'linear' }),
      animate('.lp-hero-clouds2',
        [{ transform: 'translateX(-50%)' }, { transform: 'translateX(0)' }],
        { duration: 42500, iterations: Infinity, easing: 'linear' }),
    ];

    return () => {
      for (const a of animations) a?.cancel();
    };
  }, []);

  return null;
}
