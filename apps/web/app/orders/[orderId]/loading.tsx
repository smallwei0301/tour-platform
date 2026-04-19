import PageSkeleton from '../../../src/components/guards/PageSkeleton';

export default function OrderDetailLoading() {
  return (
    <main className="tp-container tp-order-detail-page">
      <PageSkeleton title="載入訂單詳情中" lines={5} />
    </main>
  );
}
