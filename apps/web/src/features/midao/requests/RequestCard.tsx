import Link from 'next/link';
import type { RequestListItem } from './RequestListScreen';

const BUCKET_LABELS: Readonly<Record<string, string>> = {
  new: '待確認',
  needs_reply: '待回覆',
  replied: '已回覆',
  completed: '已完成',
};

export function RequestCard({ request }: { request: RequestListItem }) {
  const bucketLabel = BUCKET_LABELS[request.bucket] || '需求';
  return (
    <Link className="midao-request-card" href={`/midao/requests/${encodeURIComponent(request.requestRef)}`}>
      <div className="midao-request-card__topline">
        <span className="midao-request-card__status">{bucketLabel}</span>
        <span className="midao-request-card__date">{formatDateTime(request.request.startAt, request.request.timezone)}</span>
      </div>
      <strong className="midao-request-card__title">{request.service.title || '未命名服務'}</strong>
      <span className="midao-request-card__plan">{request.service.planName || '預約需求'}</span>
      <div className="midao-request-card__meta">
        <span>{request.traveler.displayName || '旅人'} · {request.request.partySize ? `${request.request.partySize} 位` : '人數待確認'}</span>
        {request.needsReply ? <span className="midao-request-card__reply">需要回覆</span> : null}
      </div>
      <span className="midao-request-card__arrow" aria-hidden="true">→</span>
    </Link>
  );
}

function formatDateTime(value: string, timezone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '日期待確認';
  try {
    return new Intl.DateTimeFormat('zh-TW', {
      timeZone: timezone,
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('zh-TW', {
      timeZone: 'Asia/Taipei',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }
}
