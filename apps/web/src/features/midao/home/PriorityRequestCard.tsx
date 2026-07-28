import Link from 'next/link';
import type { HomePriorityRequest } from './HomeScreen';

export function PriorityRequestCard({ request }: { request: HomePriorityRequest }) {
  return (
    <Link className="midao-home-priority-card" href={`/midao/requests/${encodeURIComponent(request.requestRef)}`}>
      <div className="midao-home-priority-card__topline">
        <span className="midao-home-status-pill">{request.needsReply ? '待回覆' : '待確認'}</span>
        <span className="midao-home-priority-card__date">{formatDateTime(request.startAt)}</span>
      </div>
      <strong>{request.serviceTitle || '未命名服務'}</strong>
      <span className="midao-home-priority-card__meta">
        {request.travelerDisplayName || '旅人'} · {request.partySize ? `${request.partySize} 位` : '人數待確認'}
      </span>
      <span className="midao-home-priority-card__arrow" aria-hidden="true">→</span>
    </Link>
  );
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
