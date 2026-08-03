'use client';

import type { RequestDetail } from './RequestDetailScreen';

const BUCKET_LABELS: Readonly<Record<string, string>> = {
  new: '待確認',
  needs_reply: '待回覆',
  replied: '已回覆',
  completed: '已完成',
};

export function RequestSummaryCard({ detail }: { detail: RequestDetail }) {
  const bucketLabel = BUCKET_LABELS[detail.bucket] || '需求';
  const serviceTitle = detail.service.title || '未命名服務';

  return (
    <section className="midao-request-detail-card" aria-labelledby="midao-request-summary-title">
      <div className="midao-request-detail-card__header">
        <div>
          <p className="midao-home-eyebrow">預約需求</p>
          <h3 id="midao-request-summary-title" className="midao-heading">{serviceTitle}</h3>
        </div>
        <span className="midao-request-card__status">{bucketLabel}</span>
      </div>

      <dl className="midao-request-detail-grid">
        <DetailField label="旅人" value={detail.traveler.displayName || '匿名旅人'} />
        <DetailField label="行程時間" value={formatDateRange(detail.request.startAt, detail.request.endAt, detail.request.timezone)} />
        <DetailField label="人數" value={detail.request.partySize ? `${detail.request.partySize} 位` : '人數待確認'} />
        <DetailField label="方案" value={detail.service.planName || '預約需求'} />
        <DetailField label="聯絡 Email" value={detail.traveler.contactEmail || '未提供'} />
        <DetailField label="聯絡電話" value={detail.traveler.contactPhone || '未提供'} />
        <DetailField label="預約金額" value={formatAmount(detail.totalTwd)} />
        <DetailField label="收到時間" value={formatDateTime(detail.receivedAt)} />
      </dl>

      <div className="midao-request-detail-note">
        <span className="midao-request-detail-note__label">旅人備註</span>
        <p>{detail.request.customerNote || '旅人沒有留下備註'}</p>
      </div>
    </section>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="midao-request-detail-field">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function formatDateRange(startAt: string, endAt: string, timezone: string): string {
  const start = formatDateTime(startAt, timezone);
  const end = formatDateTime(endAt, timezone);
  return `${start} – ${end}`;
}

function formatDateTime(value: string, timezone = 'Asia/Taipei'): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '日期待確認';
  const options: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  };
  try {
    return new Intl.DateTimeFormat('zh-TW', options).format(date);
  } catch {
    return new Intl.DateTimeFormat('zh-TW', { ...options, timeZone: 'Asia/Taipei' }).format(date);
  }
}

function formatAmount(value: number | null): string {
  return value === null ? '金額待確認' : `NT$ ${new Intl.NumberFormat('zh-TW').format(value)}`;
}
