'use client';
import Image, { type ImageProps } from 'next/image';

import { useState } from 'react';

export type FallbackImageProps = Omit<ImageProps, 'onError'> & {
  /** 兩段式載入都失敗（連原圖都載不到）時呼叫，呼叫端可顯示「無法載入」佔位。 */
  onFinalError?: () => void;
};

/**
 * 兩段式載入的圖片元件，避免「後台已上傳但前台顯示無法載入」(#admin-photo)。
 *
 * 1. 先走 Next 影像優化器（`/_next/image`）取得 AVIF/WebP 變體。
 * 2. 若優化器回非 2xx（Vercel 影像優化額度用罄、大尺寸變體逾時、來源格式無法
 *    優化等），自動退回 `unoptimized` 直接載入原始 URL —— 圖片仍能正常顯示。
 * 3. 連原圖都載入失敗，才視為真正壞圖並呼叫 `onFinalError`。
 *
 * 重點：保留 `next/image` 的版面與樣式（width/height/className/style 全部沿用），
 * 只在退回時關閉優化，不改變佈局；因此既有 CSS（如 .kkd-carousel-slide img）依舊適用。
 */
export function FallbackImage({ onFinalError, unoptimized, alt, ...rest }: FallbackImageProps) {
  const [degraded, setDegraded] = useState(false);

  return (
    <Image
      {...rest}
      alt={alt}
      unoptimized={degraded ? true : unoptimized}
      onError={() => {
        if (!degraded) {
          // 第一次失敗：退回原圖直接載入（不經優化器）。
          setDegraded(true);
        } else {
          // 退回後仍失敗：原圖本身壞掉，交由呼叫端處理。
          onFinalError?.();
        }
      }}
    />
  );
}
