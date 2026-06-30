'use client';

// 互動式裁切對話框：使用者選好檔案後，可在固定比例的裁切框內「拖曳平移 +
// 縮放」，按確認後輸出裁切並壓縮過的 WebP File 再上傳。
//
// 原本導遊大頭照是「自動中央裁切」，旅客常抱怨臉被切掉；此元件讓導遊自行
// 決定裁切範圍與大小。幾何運算抽在 src/lib/avatar-crop-geometry.ts（純函式、
// 有單元測試），本元件只負責 DOM／指標事件與最終 canvas 編碼。

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clampOffset,
  coverBaseScale,
  sourceRect,
  zoomAboutCenter,
  type Offset,
} from '../lib/avatar-crop-geometry';

const PURPLE = '#7c3aed';

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.01;

export type ImageCropModalProps = {
  /** 待裁切的原始檔案。 */
  file: File;
  /** 裁切比例（寬/高）。大頭照為 1，封面為 16/9。 */
  aspect: number;
  /** 輸出寬高（像素）。 */
  outputWidth: number;
  outputHeight: number;
  /** 圓形預覽（大頭照）；其餘為方形。 */
  round?: boolean;
  title?: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: (file: File) => void;
};

// 裁切框在畫面上的最大邊長（像素）；依比例算另一邊。
const VIEW_MAX = 300;

export default function ImageCropModal({
  file,
  aspect,
  outputWidth,
  outputHeight,
  round = false,
  title = '調整裁切範圍',
  confirmLabel = '套用',
  onCancel,
  onConfirm,
}: ImageCropModalProps) {
  const viewW = aspect >= 1 ? VIEW_MAX : Math.round(VIEW_MAX * aspect);
  const viewH = aspect >= 1 ? Math.round(VIEW_MAX / aspect) : VIEW_MAX;

  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [loadError, setLoadError] = useState('');
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });

  const baseScaleRef = useRef(1);
  const offsetRef = useRef<Offset>({ x: 0, y: 0 });
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; startOffset: Offset } | null>(null);

  // 同步 offset 到 ref，供拖曳／縮放即時讀取最新值（避免閉包過期）。
  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  // 載入原圖，置中起始位置。
  useEffect(() => {
    let revoked = false;
    const url = URL.createObjectURL(file);
    const el = new window.Image();
    el.onload = () => {
      if (revoked) return;
      const base = coverBaseScale(el.naturalWidth, el.naturalHeight, viewW, viewH);
      baseScaleRef.current = base;
      const dispW = el.naturalWidth * base;
      const dispH = el.naturalHeight * base;
      // 起始置中。
      const centered = clampOffset((viewW - dispW) / 2, (viewH - dispH) / 2, dispW, dispH, viewW, viewH);
      setImg(el);
      setZoom(MIN_ZOOM);
      setOffset(centered);
    };
    el.onerror = () => {
      if (!revoked) setLoadError('圖片載入失敗（可能是不支援的格式，例如 HEIC，請改用 JPG／PNG）');
    };
    el.src = url;
    return () => {
      revoked = true;
      URL.revokeObjectURL(url);
    };
  }, [file, viewW, viewH]);

  // Esc 關閉。
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const scale = baseScaleRef.current * zoom;
  const dispW = img ? img.naturalWidth * scale : 0;
  const dispH = img ? img.naturalHeight * scale : 0;

  const applyZoom = useCallback(
    (nextZoom: number) => {
      if (!img) return;
      const clampedZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
      const prevScale = baseScaleRef.current * zoom;
      const nextScale = baseScaleRef.current * clampedZoom;
      const moved = zoomAboutCenter(offsetRef.current, prevScale, nextScale, viewW, viewH);
      const nextDispW = img.naturalWidth * nextScale;
      const nextDispH = img.naturalHeight * nextScale;
      setZoom(clampedZoom);
      setOffset(clampOffset(moved.x, moved.y, nextDispW, nextDispH, viewW, viewH));
    },
    [img, zoom, viewW, viewH],
  );

  function onPointerDown(e: React.PointerEvent) {
    if (!img) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startOffset: offsetRef.current,
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag || !img || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    setOffset(
      clampOffset(drag.startOffset.x + dx, drag.startOffset.y + dy, dispW, dispH, viewW, viewH),
    );
  }

  function endDrag(e: React.PointerEvent) {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
  }

  function onWheel(e: React.WheelEvent) {
    if (!img) return;
    // deltaY < 0 表向上滾＝放大。
    applyZoom(zoom - e.deltaY * 0.0015);
  }

  function handleConfirm() {
    if (!img) return;
    const rect = sourceRect(offsetRef.current.x, offsetRef.current.y, scale, viewW, viewH);
    const canvas = document.createElement('canvas');
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setLoadError('無法建立 canvas context');
      return;
    }
    ctx.drawImage(img, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, outputWidth, outputHeight);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setLoadError('裁切失敗，請重試');
          return;
        }
        onConfirm(new File([blob], 'avatar.webp', { type: 'image/webp' }));
      },
      'image/webp',
      0.85,
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-testid="image-crop-modal"
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        style={{
          background: '#fff', borderRadius: 16, padding: 20,
          width: '100%', maxWidth: 380,
          display: 'flex', flexDirection: 'column', gap: 16,
          boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111' }}>{title}</h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6b7280' }}>
            拖曳照片調整位置，左右滑桿調整大小
          </p>
        </div>

        {loadError ? (
          <p style={{ margin: 0, fontSize: 13, color: '#dc2626' }}>⚠️ {loadError}</p>
        ) : (
          <>
            <div
              style={{
                position: 'relative',
                width: viewW, height: viewH,
                margin: '0 auto',
                borderRadius: round ? '50%' : 12,
                overflow: 'hidden',
                background: '#111',
                touchAction: 'none',
                cursor: img ? 'grab' : 'wait',
                userSelect: 'none',
              }}
              data-testid="image-crop-viewport"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onWheel={onWheel}
            >
              {img && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={img.src}
                  alt="裁切預覽"
                  draggable={false}
                  style={{
                    position: 'absolute',
                    left: 0, top: 0,
                    width: dispW, height: dispH,
                    transform: `translate(${offset.x}px, ${offset.y}px)`,
                    maxWidth: 'none',
                    pointerEvents: 'none',
                  }}
                />
              )}
              {/* 邊框輔助線 */}
              <div
                style={{
                  position: 'absolute', inset: 0,
                  border: '2px solid rgba(255,255,255,0.85)',
                  borderRadius: round ? '50%' : 12,
                  pointerEvents: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span aria-hidden style={{ fontSize: 14, color: '#9ca3af' }}>－</span>
              <input
                type="range"
                aria-label="縮放"
                data-testid="image-crop-zoom"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step={ZOOM_STEP}
                value={zoom}
                disabled={!img}
                onChange={(e) => applyZoom(Number(e.target.value))}
                style={{ flex: 1, accentColor: PURPLE }}
              />
              <span aria-hidden style={{ fontSize: 18, color: '#9ca3af' }}>＋</span>
            </div>
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '9px 18px', borderRadius: 8, border: '1px solid #e5e7eb',
              fontSize: 14, fontWeight: 600, color: '#374151', background: '#fff', cursor: 'pointer',
            }}
          >
            取消
          </button>
          <button
            type="button"
            data-testid="image-crop-confirm"
            onClick={handleConfirm}
            disabled={!img || !!loadError}
            style={{
              padding: '9px 22px', borderRadius: 8, border: 'none',
              fontSize: 14, fontWeight: 700, color: '#fff',
              background: !img || loadError ? '#a78bfa' : PURPLE,
              cursor: !img || loadError ? 'not-allowed' : 'pointer',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
