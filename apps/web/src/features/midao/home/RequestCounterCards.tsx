import Link from 'next/link';

interface RequestCounterCardsProps {
  counters: {
    pendingBookingRequests: number;
    messageThreadsNeedingReply: number;
  };
}

export function RequestCounterCards({ counters }: RequestCounterCardsProps) {
  return (
    <section className="midao-home-counter-grid" aria-label="需求摘要">
      <Link
        className="midao-home-counter-card"
        data-testid="midao-home-counter-pending"
        href="/midao/requests?bucket=new"
      >
        <span className="midao-home-counter-card__label">待確認的預約</span>
        <strong className="midao-home-counter-card__value">{counters.pendingBookingRequests}</strong>
        <span className="midao-home-counter-card__hint">需要你確認的旅人預約</span>
      </Link>
      <Link
        className="midao-home-counter-card"
        data-testid="midao-home-counter-messages"
        href="/midao/requests?bucket=needs_reply"
      >
        <span className="midao-home-counter-card__label">待回覆訊息</span>
        <strong className="midao-home-counter-card__value">{counters.messageThreadsNeedingReply}</strong>
        <span className="midao-home-counter-card__hint">旅人正在等你的回應</span>
      </Link>
    </section>
  );
}
