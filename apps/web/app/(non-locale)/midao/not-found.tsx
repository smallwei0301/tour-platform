import Link from 'next/link';

export default function MidaoNotFound() {
  return (
    <section className="midao-inline-error">
      <h2 className="midao-heading">找不到這個頁面</h2>
      <p>這個祕島後台頁面可能已移動。</p>
      <Link href="/midao">返回首頁</Link>
    </section>
  );
}
