import Link from 'next/link';

export default async function ExperiencePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const response = await fetch((process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000') + '/api/experiences', { cache: 'no-store' }).catch(() => null);

  let experience = { title: '柴山探洞體驗', priceTwd: 1800, slug };
  if (response && response.ok) {
    const json = await response.json();
    const found = json?.data?.find((x: any) => x.slug === slug);
    if (found) experience = found;
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>{experience.title}</h1>
      <p>價格：NT$ {experience.priceTwd}</p>
      <Link href={`/checkout?slug=${experience.slug}`}>立即預約</Link>
    </main>
  );
}
