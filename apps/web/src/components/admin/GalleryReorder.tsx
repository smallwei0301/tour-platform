'use client';

import Image from 'next/image';
import { useState } from 'react';

import { moveImageBy, removeImageAt, reorderImage } from '../../lib/gallery-order';

interface GalleryReorderProps {
  /** 目前的活動照片 URL 陣列（順序即顯示順序）。 */
  urls: string[];
  /** 排序／移除後回呼新的陣列。 */
  onChange: (urls: string[]) => void;
}

const card: React.CSSProperties = {
  position: 'relative',
  width: 150,
  border: '1px solid #e5e7eb',
  borderRadius: 10,
  background: '#fff',
  overflow: 'hidden',
  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
};

const ctrlBtn: React.CSSProperties = {
  flex: 1,
  border: 'none',
  background: 'transparent',
  color: '#374151',
  fontSize: 14,
  lineHeight: 1,
  padding: '6px 0',
  cursor: 'pointer',
};

const ctrlBtnDisabled: React.CSSProperties = {
  ...ctrlBtn,
  color: '#d1d5db',
  cursor: 'not-allowed',
};

/**
 * 活動照片排序器：縮圖網格，支援拖曳排序（桌機）與 ←／→ 按鈕排序（觸控／無障礙），
 * 以及移除單張。第一張標示為「主圖」。純呈現元件，狀態由父層 `urls` 控制。
 */
export function GalleryReorder({ urls, onChange }: GalleryReorderProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  if (urls.length === 0) {
    return (
      <div
        data-testid="gallery-reorder-empty"
        style={{
          border: '1px dashed #d1d5db',
          borderRadius: 10,
          padding: '18px 12px',
          textAlign: 'center',
          color: '#9ca3af',
          fontSize: 13,
          background: '#fafafa',
        }}
      >
        尚無活動照片，請用上方按鈕上傳，或於下方貼上 URL。
      </div>
    );
  }

  function handleDrop(target: number) {
    if (dragIndex === null || dragIndex === target) {
      setDragIndex(null);
      setOverIndex(null);
      return;
    }
    onChange(reorderImage(urls, dragIndex, target));
    setDragIndex(null);
    setOverIndex(null);
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
        拖曳縮圖即可調整順序，或用卡片下方的 ←／→ 按鈕移動。第一張為主圖。
      </div>
      <div
        data-testid="gallery-reorder"
        style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}
      >
        {urls.map((url, i) => {
          const isDragging = dragIndex === i;
          const isOver = overIndex === i && dragIndex !== null && dragIndex !== i;
          return (
            <div
              key={url + i}
              data-testid={`gallery-item-${i}`}
              draggable
              onDragStart={() => setDragIndex(i)}
              onDragOver={(e) => {
                e.preventDefault();
                if (overIndex !== i) setOverIndex(i);
              }}
              onDrop={() => handleDrop(i)}
              onDragEnd={() => {
                setDragIndex(null);
                setOverIndex(null);
              }}
              style={{
                ...card,
                opacity: isDragging ? 0.4 : 1,
                outline: isOver ? '2px solid var(--tp-primary, #16a34a)' : 'none',
                outlineOffset: 2,
                cursor: 'grab',
              }}
            >
              <div style={{ position: 'relative', width: '100%', aspectRatio: '3 / 2', background: '#f3f4f6' }}>
                <Image
                  src={url}
                  alt={`活動照片 ${i + 1}`}
                  fill
                  sizes="150px"
                  style={{ objectFit: 'cover' }}
                />
                <span
                  style={{
                    position: 'absolute',
                    top: 6,
                    left: 6,
                    background: i === 0 ? 'var(--tp-primary, #16a34a)' : 'rgba(17,24,39,0.72)',
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 999,
                    letterSpacing: 0.3,
                  }}
                >
                  {i === 0 ? '主圖' : i + 1}
                </span>
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    top: 6,
                    right: 6,
                    background: 'rgba(17,24,39,0.55)',
                    color: '#fff',
                    fontSize: 12,
                    lineHeight: 1,
                    padding: '3px 5px',
                    borderRadius: 6,
                  }}
                >
                  ⠿
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'stretch',
                  borderTop: '1px solid #f3f4f6',
                }}
              >
                <button
                  type="button"
                  aria-label={`把第 ${i + 1} 張往前移`}
                  title="往前移"
                  disabled={i === 0}
                  onClick={() => onChange(moveImageBy(urls, i, -1))}
                  style={i === 0 ? ctrlBtnDisabled : ctrlBtn}
                >
                  ←
                </button>
                <button
                  type="button"
                  aria-label={`把第 ${i + 1} 張往後移`}
                  title="往後移"
                  disabled={i === urls.length - 1}
                  onClick={() => onChange(moveImageBy(urls, i, 1))}
                  style={i === urls.length - 1 ? ctrlBtnDisabled : ctrlBtn}
                >
                  →
                </button>
                <button
                  type="button"
                  aria-label={`移除第 ${i + 1} 張`}
                  title="移除"
                  onClick={() => onChange(removeImageAt(urls, i))}
                  style={{ ...ctrlBtn, color: '#dc2626', borderLeft: '1px solid #f3f4f6' }}
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
