'use client';
import { useRef, useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

import { FallbackImage } from '../shared/FallbackImage';

interface ImageCarouselProps {
  images: string[];
  alt: string;
  sizes?: string;
}

/**
 * Image carousel with placeholder fallback
 * - Shows placeholder when no images available
 * - Handles image load errors gracefully
 * - Mobile: swipeable carousel
 * - Desktop: 左側大圖 + 右側可垂直捲動的縮圖列；點縮圖即把該張切成大圖
 *   （縮圖列可捲動，故所有照片皆可瀏覽，不再受「只顯示前 4 張」限制）。
 */
export function ImageCarousel({ images, alt, sizes }: ImageCarouselProps) {
  const t = useTranslations('imageCarousel');
  const trackRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  // 桌機大圖顯示哪一張（點右側縮圖切換）。index 對應 validImages。
  const [mainIndex, setMainIndex] = useState(0);
  const [errorImages, setErrorImages] = useState<Set<number>>(new Set());

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const idx = Number((entry.target as HTMLElement).dataset.index);
            if (!isNaN(idx)) setActiveIndex(idx);
          }
        });
      },
      { root: track, threshold: 0.6 }
    );

    Array.from(track.children).forEach((child) => observer.observe(child));
    return () => observer.disconnect();
  }, [images]);

  // Filter out errored images
  const validImages = images.filter((_, i) => !errorImages.has(i));
  // 大圖 index 需夾在有效範圍內（若被選中的圖之後才載入失敗、validImages 縮短時）
  const safeMainIndex = Math.min(Math.max(mainIndex, 0), Math.max(validImages.length - 1, 0));

  function handleImageError(index: number) {
    setErrorImages(prev => new Set(prev).add(index));
  }

  // No images or all failed - show placeholder
  if (!images || images.length === 0 || validImages.length === 0) {
    return (
      <div className="kkd-carousel-wrap">
        <div
          style={{
            width: '100%',
            aspectRatio: '16/9',
            background: 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)',
            borderRadius: 12,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#9ca3af',
          }}
        >
          <span style={{ fontSize: 48, marginBottom: 8 }}>📷</span>
          <span style={{ fontSize: 14 }}>{t('noPhotos')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="kkd-carousel-wrap">
      {/* Mobile: swipeable */}
      <div className="kkd-carousel-track" ref={trackRef}>
        {images.map((url, i) => (
          <div key={i} className="kkd-carousel-slide" data-index={i}>
            {errorImages.has(i) ? (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  background: '#f3f4f6',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#9ca3af',
                  fontSize: 14,
                }}
              >
                {t('loadFailed')}
              </div>
            ) : (
              <FallbackImage
                src={url}
                alt={`${alt} ${i + 1}`}
                priority={i === 0}
                loading={i === 0 ? undefined : 'lazy'}
                sizes={sizes ?? '100vw'}
                onFinalError={() => handleImageError(i)} width={1200} height={675} />
            )}
          </div>
        ))}
      </div>

      {validImages.length > 1 && (
        <div className="kkd-carousel-dots">
          {images.map((_, i) => (
            <span
              key={i}
              className={`kkd-carousel-dot${i === activeIndex ? ' active' : ''}${errorImages.has(i) ? ' error' : ''}`}
              style={errorImages.has(i) ? { opacity: 0.3 } : undefined}
            />
          ))}
        </div>
      )}

      {/* Desktop: 左側大圖 + 右側可捲動縮圖列（點縮圖切成大圖） */}
      <div className="kkd-gallery-desktop">
        {validImages.length > 0 && (
          <div className="kkd-gallery-main-wrap">
            <FallbackImage
              src={validImages[safeMainIndex]}
              alt={alt}
              className="kkd-gallery-main"
              priority
              // 桌面 gallery 在手機為 display:none；mobile 用 0vw 避免 next/image 在
              // 手機端 priority-preload 這張隱藏主圖（否則會與手機輪播首圖搶頻寬、
              // 重複下載同一張圖）。桌面維持 75vw 作為 LCP 主圖。
              sizes="(min-width: 768px) 75vw, 0vw"
              onFinalError={() => handleImageError(images.indexOf(validImages[safeMainIndex]))} width={1200} height={675} />
          </div>
        )}
        {validImages.length > 1 && (
          <div className="kkd-gallery-thumbs" role="listbox" aria-label={t('thumbnailsLabel')}>
            {validImages.map((url, i) => (
              <button
                key={i}
                type="button"
                role="option"
                aria-selected={i === safeMainIndex}
                aria-label={t('thumbnailItem', { index: i + 1, total: validImages.length })}
                className={`kkd-gallery-thumb-btn${i === safeMainIndex ? ' active' : ''}`}
                onClick={() => setMainIndex(i)}
              >
                <FallbackImage
                  src={url}
                  alt={`${alt} ${i + 1}`}
                  className="kkd-gallery-thumb"
                  loading="lazy"
                  sizes="(min-width: 768px) 25vw, 0vw"
                  onFinalError={() => handleImageError(images.indexOf(url))} width={1200} height={675} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
