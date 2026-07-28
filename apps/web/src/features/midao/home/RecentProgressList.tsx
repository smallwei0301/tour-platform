import Link from 'next/link';
import type { HomeRecentProgress } from './HomeScreen';

const BUCKET_LABELS: Readonly<Record<string, string>> = {
  all: '全部',
  new: '新需求',
  needs_reply: '待回覆',
  replied: '已回覆',
  completed: '已完成',
};

export function RecentProgressList({ items }: { items: HomeRecentProgress[] }) {
  return (
    <section className="midao-home-section" aria-labelledby="midao-home-recent-title">
      <div className="midao-home-section__header">
        <div>
          <p className="midao-home-eyebrow">掌握變化</p>
          <h3 id="midao-home-recent-title" className="midao-heading">最近進度</h3>
        </div>
        <span className="midao-home-section__limit">最多 3 筆</span>
      </div>
      {items.length > 0 ? (
        <div className="midao-home-recent-list" data-testid="midao-home-recent-list">
          {items.slice(0, 3).map((item) => (
            <Link key={item.requestRef} className="midao-home-recent-item" href={`/midao/requests/${encodeURIComponent(item.requestRef)}`}>
              <span className="midao-home-recent-item__marker" aria-hidden="true" />
              <span className="midao-home-recent-item__body">
                <strong>{item.serviceTitle || '未命名服務'}</strong>
                <span>{BUCKET_LABELS[item.bucket] || '需求更新'} · {formatDate(item.updatedAt)}</span>
              </span>
              <span aria-hidden="true">→</span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="midao-home-empty" data-testid="midao-home-recent-empty">目前沒有最近進度</p>
      )}
    </section>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: 'numeric',
    day: 'numeric',
  }).format(date);
}
