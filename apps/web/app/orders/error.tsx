'use client';

import InlineErrorState from '../../src/components/guards/InlineErrorState';

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function OrdersSegmentError({ error, reset }: Props) {
  return (
    <main className="tp-container tp-orders-page">
      <InlineErrorState
        title="訂單頁面暫時不可用"
        message={error?.message}
        onRetry={reset}
        retryLabel="重新載入"
      />
    </main>
  );
}
