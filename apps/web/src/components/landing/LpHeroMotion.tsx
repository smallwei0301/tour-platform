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
      // Ken Burns 慢速推近（原點對準洞口，見 .lp-hero-photo transform-origin）
      animate('.lp-hero-photo',
        [{ transform: 'scale(1)' }, { transform: 'scale(1.09)' }],
        { duration: 16000, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' }),
      // 暮色罩由濃轉淡：照片像被曙光逐漸點亮
      animate('.lp-hero-dawn',
        [{ opacity: 1 }, { opacity: 0 }],
        { duration: 9000, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' }),
      // 洞口放射光束：擺動＋呼吸
      animate('.lp-hero-rays',
        [
          { opacity: 0.2, transform: 'rotate(-3deg)' },
          { opacity: 0.8, transform: 'rotate(3deg)' },
        ],
        { duration: 12000, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' }),
      // 雲層飄動：平移一個圖樣週期（background-size 50% → -50% 即無縫循環）
      animate('.lp-hero-clouds',
        [{ transform: 'translateX(0)' }, { transform: 'translateX(-50%)' }],
        { duration: 55000, iterations: Infinity, easing: 'linear' }),
      animate('.lp-hero-clouds2',
        [{ transform: 'translateX(-50%)' }, { transform: 'translateX(0)' }],
        { duration: 85000, iterations: Infinity, easing: 'linear' }),
    ];

    return () => {
      for (const a of animations) a?.cancel();
    };
  }, []);

  return null;
}
