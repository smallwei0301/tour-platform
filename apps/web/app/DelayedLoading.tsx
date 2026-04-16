'use client';

import { useEffect, useState } from 'react';

interface DelayedLoadingProps {
  delayMs?: number;
}

export default function DelayedLoading({ delayMs = 250 }: DelayedLoadingProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShow(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);

  if (!show) return null;

  return (
    <main style={{ padding: 24 }}>
      <p>載入中...</p>
    </main>
  );
}
