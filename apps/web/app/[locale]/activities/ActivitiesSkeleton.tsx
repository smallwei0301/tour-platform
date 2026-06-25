/**
 * Issue #1345 — Skeleton placeholder for the activities listing.
 *
 * The Suspense fallback on `/activities` and `/activities/[region]`
 * used to be either a 1-line "載入中⋯" string or `null`. When the
 * real `<ActivitiesContent>` streamed in, `main-content` grew from
 * ~60 px to ~1500 px in a single chunk, generating CLS up to 0.94
 * (#1317 round-4 + post-#1347 Lighthouse).
 *
 * This skeleton mirrors the real grid + card footprint so the
 * stream-in replaces same-sized boxes — shift distance ≈ 0.
 *
 * Decorative only: `aria-hidden="true"` keeps it out of assistive
 * tech and SEO; the real cards remain the only navigable content.
 */
export default function ActivitiesSkeleton() {
  return (
    <main className="tp-container tp-activities" style={{ paddingBottom: 40 }}>
      <div className="tp-breadcrumb">首頁 &gt; 探索行程</div>
      <section className="tp-activities-layout">
        <aside className="tp-filter" aria-hidden="true" style={{ minHeight: 320 }} />
        <div>
          <div className="tp-result-head">
            <h1>全台灣私人導遊行程</h1>
          </div>
          <div className="tp-card-grid tp-card-grid-activities">
            {Array.from({ length: 6 }).map((_, i) => (
              <article key={i} className="tp-card tp-card-skeleton" aria-hidden="true">
                <div className="tp-card-img tp-card-img-skeleton" />
                <div className="tp-card-skeleton-line" style={{ width: '60%' }} />
                <div className="tp-card-skeleton-line" style={{ width: '85%' }} />
                <div className="tp-card-skeleton-line" style={{ width: '40%' }} />
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
