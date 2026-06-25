'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';

/**
 * 評價照片縮圖列 + 點擊放大的 in-page lightbox（口碑評論／旅客評論共用）。
 *
 * 點縮圖不再 `target="_blank"` 另開分頁，而是在當頁彈出燈箱小視窗檢視大圖；
 * 支援多張左右切換、鍵盤（ESC 關閉、←/→ 切換）、點背景關閉，並做響應式
 * （圖片以 contain 限制在 92vw × 86vh 內，手機到桌機都不溢出）。
 */
export function ReviewPhotos({ photos, authorLabel }: { photos: string[]; authorLabel: string }) {
  const t = useTranslations('reviewPhotos');
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const close = useCallback(() => setOpenIndex(null), []);
  const showPrev = useCallback(
    () => setOpenIndex((i) => (i == null ? i : (i - 1 + photos.length) % photos.length)),
    [photos.length],
  );
  const showNext = useCallback(
    () => setOpenIndex((i) => (i == null ? i : (i + 1) % photos.length)),
    [photos.length],
  );

  // 開啟時鎖背景捲動 + 綁鍵盤；關閉時還原。
  useEffect(() => {
    if (openIndex == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') showPrev();
      else if (e.key === 'ArrowRight') showNext();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [openIndex, close, showPrev, showNext]);

  if (!Array.isArray(photos) || photos.length === 0) return null;

  const hasMultiple = photos.length > 1;

  return (
    <>
      <div className="kkd-review-photos" data-testid="review-photos">
        {photos.map((src, pi) => (
          <button
            key={pi}
            type="button"
            className="kkd-review-photo"
            onClick={() => setOpenIndex(pi)}
            aria-label={t('zoomPhoto', { author: authorLabel, n: pi + 1 })}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={t('photoAlt', { author: authorLabel, n: pi + 1 })} loading="lazy" />
          </button>
        ))}
      </div>

      {mounted && openIndex != null
        ? createPortal(
            <div
              className="kkd-lightbox"
              role="dialog"
              aria-modal="true"
              aria-label={t('lightboxLabel', { author: authorLabel })}
              data-testid="review-lightbox"
              onClick={close}
            >
              <button
                type="button"
                className="kkd-lightbox-close"
                onClick={close}
                aria-label={t('close')}
                data-testid="review-lightbox-close"
              >
                ×
              </button>

              {hasMultiple && (
                <button
                  type="button"
                  className="kkd-lightbox-nav kkd-lightbox-prev"
                  onClick={(e) => {
                    e.stopPropagation();
                    showPrev();
                  }}
                  aria-label={t('prev')}
                >
                  ‹
                </button>
              )}

              {/* 點圖片本身不關閉（只有背景／按鈕才關） */}
              <figure className="kkd-lightbox-figure" onClick={(e) => e.stopPropagation()}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photos[openIndex]}
                  alt={t('photoAlt', { author: authorLabel, n: openIndex + 1 })}
                  data-testid="review-lightbox-img"
                />
                {hasMultiple && (
                  <figcaption className="kkd-lightbox-counter" data-testid="review-lightbox-counter">
                    {openIndex + 1} / {photos.length}
                  </figcaption>
                )}
              </figure>

              {hasMultiple && (
                <button
                  type="button"
                  className="kkd-lightbox-nav kkd-lightbox-next"
                  onClick={(e) => {
                    e.stopPropagation();
                    showNext();
                  }}
                  aria-label={t('next')}
                >
                  ›
                </button>
              )}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
