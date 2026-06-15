'use client';
import { useEffect, useState } from 'react';

/**
 * 編輯精選大卡照片輪播：把「行程頁內照片」（行程相片集）以淡入淡出方式自動輪播。
 * - 整張卡片為 <Link>，故圓點僅作視覺指示（非互動），避免在連結內嵌互動元件。
 * - 自動輪播；尊重 prefers-reduced-motion（不自動切換、不做淡入淡出）。
 * - 單張照片時等同原本的靜態照片呈現（不顯示圓點）。
 */
export function LpFeaturedCarousel({ images, alt }: { images: string[]; alt: string }) {
  const slides = images.filter(Boolean);
  const count = slides.length;
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (count <= 1) return;
    if (typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), 4500);
    return () => clearInterval(timer);
  }, [count]);

  // index 永遠落在有效範圍（count 變動或 reduced-motion 時保險）
  const active = count > 0 ? index % count : 0;

  return (
    <div className="lp-feat-carousel" role="group" aria-label={`${alt}・行程照片輪播`}>
      {slides.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${src}-${i}`}
          src={src}
          alt={i === 0 ? `${alt}（編輯精選）` : `${alt}・行程照片 ${i + 1}`}
          className={i === active ? 'is-active' : undefined}
          aria-hidden={i === active ? undefined : true}
          loading={i === 0 ? undefined : 'lazy'}
        />
      ))}
      {count > 1 && (
        <span className="lp-feat-dots" aria-hidden="true">
          {slides.map((_, i) => (
            <i key={i} className={i === active ? 'is-active' : undefined} />
          ))}
        </span>
      )}
    </div>
  );
}
