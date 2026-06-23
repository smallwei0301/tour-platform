/**
 * 活動詳情頁 `[region]/[slug]` 的 page-level streaming fallback。
 *
 * 為什麼需要：詳情頁是 `export const dynamic = 'force-dynamic'` 的 async
 * server component（在 return JSX 前 `await getActivityBySlugDb(...)` 做 DB
 * lookup）。在沒有這個檔案前，**slug → slug 的導航**（同 region 內換行程）
 * 上方沒有任何 loading boundary，瀏覽器要等整個 server render（preview 實測
 * TTFB ~0.5–1.4s）才換頁 → 點了像沒反應的「體感延遲」。
 *
 * 這個 loading.tsx 讓 Next.js 在導航當下「立刻」顯示骨架（並讓 <Link>
 * 能 prefetch 到這個 fallback），把感知延遲從「整頁等待」變成「即時骨架 →
 * 內容串流進來」。骨架footprint對齊真實版面（麵包屑＋hero 16/9＋標題/價格區）
 * 以避免 streamed-in 內容造成位移。
 */
export default function ActivityDetailLoading() {
  return (
    <main className="kkd-detail-page" style={{ paddingBottom: 100 }} aria-busy="true" aria-label="行程載入中">
      <div className="tp-container">
        <div className="kkd-skel kkd-skel-breadcrumb" />
      </div>
      <div className="tp-container">
        <div className="kkd-skel kkd-skel-hero" />
      </div>
      <div className="tp-container">
        <div className="kkd-detail-skel-title">
          <div className="kkd-skel kkd-skel-line" style={{ width: '70%', height: 26 }} />
          <div className="kkd-skel kkd-skel-line" style={{ width: '45%', height: 16 }} />
          <div className="kkd-skel kkd-skel-line" style={{ width: '30%', height: 22, marginTop: 14 }} />
          <div className="kkd-skel kkd-skel-line" style={{ width: '85%', height: 14, marginTop: 14 }} />
          <div className="kkd-skel kkd-skel-line" style={{ width: '60%', height: 14 }} />
        </div>
      </div>
    </main>
  );
}
