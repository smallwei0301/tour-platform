import React from 'react';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'default' | 'orange';

const VARIANT_STYLES: Record<BadgeVariant, React.CSSProperties> = {
  success: { background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0' },
  warning: { background: '#fef9c3', color: '#854d0e', border: '1px solid #fef08a' },
  danger:  { background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca' },
  info:    { background: '#dbeafe', color: '#1e40af', border: '1px solid #bfdbfe' },
  orange:  { background: '#ffedd5', color: '#9a3412', border: '1px solid #fed7aa' },
  default: { background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' },
};

export function Badge({ variant = 'default', children }: { variant?: BadgeVariant; children: React.ReactNode }) {
  return (
    <span style={{
      ...VARIANT_STYLES[variant],
      borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 600,
      display: 'inline-block', whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: BadgeVariant; label: string }> = {
    paid:                 { variant: 'success', label: '已付款' },
    confirmed:            { variant: 'success', label: '已確認' },
    completed:            { variant: 'success', label: '已完成' },
    approved:             { variant: 'success', label: '已通過' },
    pending:              { variant: 'warning', label: '待處理' },
    pending_payment:      { variant: 'warning', label: '待付款' },
    refund_pending:       { variant: 'orange',  label: '退款待審' },
    refunded:             { variant: 'orange',  label: '已退款' },
    rejected:             { variant: 'danger',  label: '已拒絕' },
    cancelled_by_user:    { variant: 'danger',  label: '用戶取消' },
    cancelled_by_guide:   { variant: 'danger',  label: '導遊取消' },
    suspended:            { variant: 'danger',  label: '已停權' },
  };
  const cfg = map[status] || { variant: 'default', label: status };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

export function Card({ children, style, ...rest }: { children: React.ReactNode; style?: React.CSSProperties; [key: string]: any }) {
  return (
    <div {...rest} style={{
      background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)', ...style,
    }}>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div style={{ padding: '24px 28px 20px', borderBottom: '1px solid #f0f0f0', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#111', letterSpacing: '-0.3px' }}>{title}</h1>
        {subtitle && <p style={{ margin: '4px 0 0', fontSize: 14, color: '#6b7280' }}>{subtitle}</p>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{actions}</div>}
    </div>
  );
}

export function BtnPrimary({ children, onClick, style }: { children: React.ReactNode; onClick?: () => void; style?: React.CSSProperties }) {
  return (
    <button onClick={onClick} style={{
      background: 'var(--tp-primary)', color: '#fff', border: 'none',
      borderRadius: 8, padding: '8px 18px', fontSize: 14, fontWeight: 600,
      cursor: 'pointer', transition: 'background 0.15s', ...style,
    }}>
      {children}
    </button>
  );
}

export function Select({ value, onChange, children, style, ...rest }: {
  value: string; onChange: (v: string) => void;
  children: React.ReactNode; style?: React.CSSProperties; [key: string]: any;
}) {
  return (
    <select {...rest} value={value} onChange={(e) => onChange(e.target.value)}
      style={{
        border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px',
        fontSize: 14, background: '#fff', color: '#374151',
        cursor: 'pointer', outline: 'none', ...style,
      }}
    >
      {children}
    </select>
  );
}

export function TableWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        {children}
      </table>
    </div>
  );
}

export const Th = ({ children, align = 'left' }: { children?: React.ReactNode; align?: 'left' | 'right' }) => (
  <th style={{ textAlign: align, padding: '10px 14px', background: '#f9fafb', color: '#6b7280', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>
    {children}
  </th>
);

export const Td = ({ children, align = 'left', style }: { children?: React.ReactNode; align?: 'left' | 'right'; style?: React.CSSProperties }) => (
  <td style={{ textAlign: align, padding: '12px 14px', borderBottom: '1px solid #f3f4f6', verticalAlign: 'middle', color: '#374151', ...style }}>
    {children}
  </td>
);

export function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ padding: '48px 24px', textAlign: 'center', color: '#9ca3af' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
      <p style={{ margin: 0, fontSize: 15 }}>{message}</p>
    </div>
  );
}

export function LoadingSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div style={{ padding: '16px 20px' }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ height: 44, borderRadius: 8, background: 'linear-gradient(90deg,#f3f4f6,#e5e7eb,#f3f4f6)', marginBottom: 8 }} />
      ))}
    </div>
  );
}
