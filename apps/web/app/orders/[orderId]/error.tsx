'use client';

import InlineErrorState from '../../../src/components/guards/InlineErrorState';

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function OrderDetailSegmentError({ error, reset }: Props) {
  return (
    <main className="tp-container tp-order-detail-page">
      <InlineErrorState
        title="訂單詳情載入失敗"
        message={error?.message}
        onRetry={reset}
        retryLabel="重新嘗試"
      />
    </main>
  );
}
