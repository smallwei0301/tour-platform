import Link from 'next/link';

type EmptyStateProps = {
  title?: string;
  description?: string;
  ctaHref?: string;
  ctaLabel?: string;
};

export default function EmptyState({
  title = '目前沒有資料',
  description = '你可以先去看看最新行程。',
  ctaHref = '/activities',
  ctaLabel = '去看看行程'
}: EmptyStateProps) {
  return (
    <section className="tp-step-card" aria-live="polite">
      <h2>{title}</h2>
      <p>{description}</p>
      <Link href={ctaHref} className="tp-btn tp-btn-primary">
        {ctaLabel}
      </Link>
    </section>
  );
}
