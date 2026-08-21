'use client';

// midao2 共用 UI 原語＋色彩常數。
// 所有 midao2 頁面（Plan 2 T3–T8）皆從此檔 import，行為/命名不得任意調整。

import React from 'react';
import { csrfHeaders } from '../../../src/lib/csrf-client';

// ── 配色常數 ──────────────────────────────────────────────
export const C = {
  ACCENT: '#2563eb',
  ACCENT_SOFT: '#eff6ff',
  BG: '#f6f4ef',
  CARD: '#ffffff',
  TEXT: '#111827',
  MUTED: '#6b7280',
  BORDER: '#e5e7eb',
  GREEN: '#15803d',
  GREEN_SOFT: '#dcfce7',
  ORANGE: '#ea580c',
  ORANGE_SOFT: '#fff7ed',
  RED: '#dc2626',
} as const;

// ── 需求狀態章 ────────────────────────────────────────────
export type MidaoRequestStatus = 'new' | 'pending_reply' | 'replied' | 'closed_won' | 'closed_done';

export const STATUS_META: Record<MidaoRequestStatus, { label: string; bg: string; fg: string }> = {
  new: { label: '新需求', bg: C.ACCENT, fg: '#ffffff' },
  pending_reply: { label: '待回覆', bg: C.ORANGE_SOFT, fg: C.ORANGE },
  replied: { label: '已回覆', bg: C.GREEN_SOFT, fg: C.GREEN },
  closed_won: { label: '已成交', bg: C.GREEN, fg: '#ffffff' },
  closed_done: { label: '已完成', bg: C.BORDER, fg: C.MUTED },
};

// ── Icon（官方 icon sprite，stroke 繼承 currentColor）───────
export function Icon({
  name,
  size = 24,
  style,
}: {
  name: string;
  size?: number;
  style?: React.CSSProperties;
}) {
  return (
    <svg width={size} height={size} style={{ display: 'block', flexShrink: 0, ...style }} aria-hidden="true">
      <use href={`/midao2/sprite.svg#icon-${name}`} />
    </svg>
  );
}

// ── Card ──────────────────────────────────────────────────
export function Card({
  children,
  style,
  onClick,
  'data-testid': testId,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  onClick?: () => void;
  'data-testid'?: string;
}) {
  return (
    <div
      onClick={onClick}
      data-testid={testId}
      style={{
        background: C.CARD,
        borderRadius: 16,
        border: `1px solid ${C.BORDER}`,
        padding: 16,
        cursor: onClick ? 'pointer' : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ── Badge（章）───────────────────────────────────────────
export function Badge({ status }: { status: MidaoRequestStatus | string }) {
  const meta = STATUS_META[status as MidaoRequestStatus] || { label: status, bg: C.BORDER, fg: C.MUTED };
  return (
    <span
      style={{
        display: 'inline-block',
        background: meta.bg,
        color: meta.fg,
        borderRadius: 999,
        padding: '4px 10px',
        fontSize: 12,
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      {meta.label}
    </span>
  );
}

// ── Btn ───────────────────────────────────────────────────
export function Btn({
  kind = 'primary',
  children,
  onClick,
  disabled,
  'data-testid': testId,
  type = 'button',
  style,
}: {
  kind?: 'primary' | 'secondary' | 'ghost';
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  'data-testid'?: string;
  type?: 'button' | 'submit' | 'reset';
  style?: React.CSSProperties;
}) {
  const base: React.CSSProperties = {
    height: 48,
    borderRadius: 12,
    fontSize: 15,
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    padding: '0 20px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  };
  const byKind: React.CSSProperties =
    kind === 'primary'
      ? { width: '100%', background: C.ACCENT, color: '#ffffff', border: 'none' }
      : kind === 'secondary'
        ? { background: C.CARD, color: C.ACCENT, border: `1px solid ${C.ACCENT}` }
        : { background: 'transparent', color: C.MUTED, border: 'none' };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      style={{ ...base, ...byKind, ...style }}
    >
      {children}
    </button>
  );
}

// ── Field（表單列）────────────────────────────────────────
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 14, color: C.MUTED }}>{label}</span>
      {children}
    </label>
  );
}

// ── Spinner ───────────────────────────────────────────────
export function Spinner() {
  return (
    <div
      style={{ display: 'flex', justifyContent: 'center', padding: 24 }}
      role="status"
      aria-label="載入中"
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          border: `3px solid ${C.BORDER}`,
          borderTopColor: C.ACCENT,
          animation: 'midao2-spin 0.8s linear infinite',
        }}
      />
      <style>{`@keyframes midao2-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── EmptyState ────────────────────────────────────────────
export function EmptyState({ text }: { text: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 16px', color: C.MUTED }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
      <p style={{ margin: 0, fontSize: 14 }}>{text}</p>
    </div>
  );
}

// ── ErrorState ────────────────────────────────────────────
export function ErrorState({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 16px', color: C.RED }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
      <p style={{ margin: '0 0 12px', fontSize: 14 }}>{text}</p>
      {onRetry && (
        <Btn kind="secondary" onClick={onRetry}>
          重試
        </Btn>
      )}
    </div>
  );
}

// ── copyToClipboard ───────────────────────────────────────
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// ── fetch envelope 包裝 ───────────────────────────────────
function redirectToLogin() {
  window.location.assign('/guide/login?next=' + encodeURIComponent(location.pathname));
}

async function handleEnvelope(res: Response): Promise<any> {
  if (res.status === 401) {
    redirectToLogin();
    throw new Error('未授權，請重新登入');
  }
  const json = await res.json().catch(() => ({}));
  if (!json.success) {
    const err = new Error(json?.error?.message || '請求失敗') as Error & { code?: string };
    err.code = json?.error?.code;
    throw err;
  }
  return json.data;
}

export async function apiGet(path: string): Promise<any> {
  const res = await fetch(path, { cache: 'no-store' });
  return handleEnvelope(res);
}

export async function apiSend(path: string, method: string, body?: any): Promise<any> {
  const res = await fetch(path, {
    method,
    headers: csrfHeaders({ 'content-type': 'application/json' }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return handleEnvelope(res);
}
