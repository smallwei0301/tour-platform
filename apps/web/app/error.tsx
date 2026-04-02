'use client';

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main style={{ padding: 24 }}>
      <h1>頁面載入失敗</h1>
      <p>{error.message}</p>
      <button onClick={() => reset()}>重試</button>
    </main>
  );
}
