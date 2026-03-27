import Link from 'next/link';

export default function HomePage() {
  return (
    <main style={{ padding: 24 }}>
      <h1>Tour Platform MVP</h1>
      <p>先從單一可交易行程起跑。</p>
      <Link href="/experiences/chaishan-cave-tour">查看柴山探洞體驗</Link>
    </main>
  );
}
