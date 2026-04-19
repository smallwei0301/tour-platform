import PageSkeleton from '../../src/components/guards/PageSkeleton';

export default function OrdersLoading() {
  return (
    <main className="tp-container tp-orders-page">
      <h1>我的訂單</h1>
      <PageSkeleton title="載入訂單中" lines={4} />
    </main>
  );
}
