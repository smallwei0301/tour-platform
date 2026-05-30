'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Card, Th, Td, EmptyState, LoadingSkeleton, StatusBadge, Badge } from './ui';

// ────────────────────────────────────────────────────────────────────
// useIsMobile — single source of truth for the 768px breakpoint.
// SSR-safe: initial value is false, real value lands after mount.
// ────────────────────────────────────────────────────────────────────
export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e: MediaQueryListEvent | MediaQueryList) =>
      setIsMobile((e as MediaQueryList).matches ?? (e as MediaQueryListEvent).matches);
    handler(mq);
    if (mq.addEventListener) mq.addEventListener('change', handler);
    else mq.addListener(handler);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', handler);
      else mq.removeListener(handler);
    };
  }, [breakpoint]);
  return isMobile;
}

// ────────────────────────────────────────────────────────────────────
// ResponsiveTable<T>
// ≥768: traditional <table> using Th/Td.
// <768: card list — each row becomes a card with title / subtitle / meta zones.
// Columns whose mobilePriority='hidden' are dropped on mobile.
// ────────────────────────────────────────────────────────────────────
export type ResponsiveColumn<T> = {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  align?: 'left' | 'right';
  thStyle?: React.CSSProperties;
  tdStyle?: React.CSSProperties;
  /** Card label override on mobile; falls back to `header`. */
  mobileLabel?: React.ReactNode;
  /**
   * - `title`    — large card heading (first row).
   * - `subtitle` — appears right of title (status badge area).
   * - `meta`     — `label: value` rows inside the card (default).
   * - `hidden`   — dropped on mobile.
   */
  mobilePriority?: 'title' | 'subtitle' | 'meta' | 'hidden';
};

export type ResponsiveTableProps<T> = {
  columns: ResponsiveColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  selectedKey?: string;
  loading?: boolean;
  loadingRows?: number;
  emptyMessage?: string;
  caption?: React.ReactNode;
};

export function ResponsiveTable<T>({
  columns,
  rows,
  getRowKey,
  onRowClick,
  selectedKey,
  loading = false,
  loadingRows = 6,
  emptyMessage = '沒有資料',
  caption,
}: ResponsiveTableProps<T>) {
  const isMobile = useIsMobile(768);

  if (loading) return <LoadingSkeleton rows={loadingRows} />;
  if (rows.length === 0) return <EmptyState message={emptyMessage} />;

  if (!isMobile) {
    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          {caption && <caption style={{ captionSide: 'top', textAlign: 'left', padding: '8px 14px', fontSize: 12, color: '#6b7280' }}>{caption}</caption>}
          <thead>
            <tr>
              {columns.map((c) => (
                <Th key={c.key} align={c.align}>{c.header}</Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const key = getRowKey(r);
              const selected = selectedKey === key;
              return (
                <tr
                  key={key}
                  onClick={onRowClick ? () => onRowClick(r) : undefined}
                  style={{
                    cursor: onRowClick ? 'pointer' : 'default',
                    background: selected ? '#f0fdf4' : 'transparent',
                  }}
                >
                  {columns.map((c) => (
                    <Td key={c.key} align={c.align} style={c.tdStyle}>{c.cell(r)}</Td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // Mobile: card list
  const titleCols = columns.filter((c) => c.mobilePriority === 'title');
  const subtitleCols = columns.filter((c) => c.mobilePriority === 'subtitle');
  const metaCols = columns.filter((c) => !c.mobilePriority || c.mobilePriority === 'meta');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12 }}>
      {rows.map((r) => {
        const key = getRowKey(r);
        const selected = selectedKey === key;
        return (
          <div
            key={key}
            onClick={onRowClick ? () => onRowClick(r) : undefined}
            style={{
              background: selected ? '#f0fdf4' : '#fff',
              border: '1px solid #e5e7eb',
              borderLeft: selected ? '3px solid var(--tp-primary)' : '1px solid #e5e7eb',
              borderRadius: 10,
              padding: '12px 14px',
              cursor: onRowClick ? 'pointer' : 'default',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {(titleCols.length > 0 || subtitleCols.length > 0) && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, color: '#111', wordBreak: 'break-word' }}>
                  {titleCols.map((c) => <div key={c.key}>{c.cell(r)}</div>)}
                </div>
                <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                  {subtitleCols.map((c) => <div key={c.key}>{c.cell(r)}</div>)}
                </div>
              </div>
            )}
            {metaCols.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontSize: 13, color: '#374151' }}>
                {metaCols.map((c) => (
                  <React.Fragment key={c.key}>
                    <div style={{ color: '#6b7280', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap', alignSelf: 'center' }}>
                      {c.mobileLabel ?? c.header}
                    </div>
                    <div style={{ textAlign: c.align === 'right' ? 'right' : 'left', minWidth: 0, wordBreak: 'break-word' }}>
                      {c.cell(r)}
                    </div>
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// ResponsiveModal — viewport-bounded overlay.
// Default width: min(560, calc(100vw - 32px)); mobile picks bottom-sheet alignment.
// ────────────────────────────────────────────────────────────────────
export type ResponsiveModalProps = {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Override default close-on-backdrop-click. */
  dismissOnBackdrop?: boolean;
  /** Optional data-* hook for tests/guide. */
  ['data-testid']?: string;
};

const SIZE_MAX: Record<NonNullable<ResponsiveModalProps['size']>, number> = {
  sm: 440, md: 560, lg: 720,
};

export function ResponsiveModal({
  open, onClose, title, footer, children,
  size = 'md', dismissOnBackdrop = true,
  ...rest
}: ResponsiveModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);
  const titleId = 'responsive-modal-title';

  // Capture trigger element on open; restore focus on close.
  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement;
      // Defer so the panel is mounted before we focus it.
      setTimeout(() => panelRef.current?.focus(), 0);
    } else {
      if (triggerRef.current && (triggerRef.current as HTMLElement).focus) {
        (triggerRef.current as HTMLElement).focus();
      }
      triggerRef.current = null;
    }
  }, [open]);

  // Focus trap + Escape handler.
  useEffect(() => {
    if (!open) return;
    const FOCUSABLE =
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) { e.preventDefault(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const maxWidth = SIZE_MAX[size];

  return (
    <div
      className="admin-modal-backdrop"
      onClick={dismissOnBackdrop ? onClose : undefined}
      data-testid={rest['data-testid']}
    >
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        className="admin-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        style={{
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
          width: `min(${maxWidth}px, calc(100vw - 24px))`,
          maxHeight: 'calc(100dvh - 24px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          outline: 'none',
        }}
      >
        {title && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '14px 20px', borderBottom: '1px solid #f0f0f0', gap: 12,
          }}>
            <div
              id={titleId}
              style={{ fontWeight: 700, fontSize: 16, color: '#111', flex: 1, minWidth: 0, wordBreak: 'break-word' }}
            >
              {title}
            </div>
            <button
              onClick={onClose}
              aria-label="關閉"
              style={{
                border: 'none', background: 'none', fontSize: 22, lineHeight: 1,
                cursor: 'pointer', color: '#9ca3af', padding: 4, flexShrink: 0,
              }}
            >
              ✕
            </button>
          </div>
        )}
        <div style={{
          flex: 1, overflow: 'auto',
          padding: 'clamp(14px, 4vw, 22px)',
        }}>
          {children}
        </div>
        {footer && (
          <div style={{
            padding: '12px 20px',
            borderTop: '1px solid #f0f0f0',
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-end',
            flexWrap: 'wrap',
            background: '#fafafa',
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// FormGrid — N-column form layout that collapses on small screens.
// 1024+: cols. 640–1024: min(cols, 2). <640: 1.
// ────────────────────────────────────────────────────────────────────
export function FormGrid({
  cols = 2,
  gap = 12,
  children,
  style,
}: {
  cols?: 1 | 2 | 3 | 4;
  gap?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const tabletCols = Math.min(cols, 2);
  // Use a scoped class so we can write proper media queries instead of inline.
  const cls = `admin-form-grid-${cols}`;
  return (
    <>
      <style>{`
        .${cls} { display: grid; grid-template-columns: repeat(${cols}, minmax(0, 1fr)); gap: ${gap}px; }
        @media (max-width: 1024px) { .${cls} { grid-template-columns: repeat(${tabletCols}, minmax(0, 1fr)); } }
        @media (max-width: 640px)  { .${cls} { grid-template-columns: 1fr; } }
      `}</style>
      <div className={cls} style={style}>{children}</div>
    </>
  );
}

// Re-export commonly used building blocks so pages can import everything from one file.
export { Card, Th, Td, EmptyState, LoadingSkeleton, StatusBadge, Badge };
