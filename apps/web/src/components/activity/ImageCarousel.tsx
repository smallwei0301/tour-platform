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
 * - Mobile 與桌機皆為左右滑動輪播（scroll-snap + 圓點指示），可滑覽全部照片。
 *   （原桌機 3:1 grid 只顯示前 4 張、無法滑到更多，已於此改為統一的滑動輪播。）
 */
export function ImageCarousel({ images, alt, sizes }: ImageCarouselProps) {
  const t = useTranslations('imageCarousel');
  const trackRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
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
      {/* 左右滑動輪播（mobile + desktop 共用，可滑覽全部照片） */}
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
    </div>
  );
}
