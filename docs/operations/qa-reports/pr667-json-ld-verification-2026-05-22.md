# QA Report — PR #667 TouristAttraction JSON-LD Verification

**Issue:** #668
**PR:** #667 (feat(seo): add TouristAttraction JSON-LD to activity detail page + SEO/GEO/AEO launch checklist)
**Deploy SHA:** 9a2c620
**Environment:** https://tour-platform-nine.vercel.app
**Tested:** 2026-05-22 CST
**Agent:** tour-loop / Claudia

---

## Verdict: PASS (with minor notes)

---

## JSON-LD Verification

All three tested activity pages emit a valid `TouristAttraction` JSON-LD block.

### Pages Tested

| Page | URL | Result |
|------|-----|--------|
| 大稻埕百年老街深度漫步 | `/activities/taipei/dadadaocheng-walk` | PASS |
| 高雄柴山探洞體驗 | `/activities/kaohsiung/kaohsiung-chaishan-cave-experience` | PASS |
| 花蓮秀姑巒溪溯溪全日冒險 | `/activities/hualien/hualien-river-trekking` | PASS |

### Field Validation

| Field | Expected | dadadaocheng-walk | chaishan | hualien |
|-------|----------|-------------------|----------|---------|
| `@context` | `https://schema.org` | ✓ | ✓ | ✓ |
| `@type` | `TouristAttraction` | ✓ | ✓ | ✓ |
| `name` | non-empty | ✓ | ✓ | ✓ |
| `description` | non-empty | ✓ | ✓ | ✓ |
| `url` | contains production domain | ✓ | ✓ | ✓ |
| `image` | non-empty | ✓ (absolute URL) | ✓ (relative path) | ✓ (absolute URL) |
| `priceRange` | starts with `NT$` | ✓ `NT$1500起` | ✓ `NT$2000起` | ✓ `NT$3200起` |
| `address.@type` | `PostalAddress` | ✓ | ✓ | ✓ |
| `address.addressCountry` | `TW` | ✓ | ✓ | ✓ |
| JSON valid | parses without error | ✓ | ✓ | ✓ |

### Minor Notes

1. **JSON-LD `url` field uses Chinese region name** (e.g., `/activities/台北市/dadadaocheng-walk`) because it reads `activity.region` rather than `activity.regionSlug`. Both URL forms return HTTP 200. However, the canonical URL in JSON-LD contains percent-encoded Chinese characters, which while valid, is less clean than using the ASCII regionSlug (e.g., `taipei`). Not a launch blocker — backlog improvement.

2. **`image` field for chaishan activity is a relative path** (`/images/activities/chaishan/main.jpg`). The file resolves to HTTP 200 on production. Schema.org validators prefer absolute URLs; this is a minor improvement for a future PR.

---

## robots.txt

**Status: PASS**

All required disallow rules are present:

```
Disallow: /admin
Disallow: /guide/
Disallow: /api/
Disallow: /booking/
Disallow: /me/
Disallow: /checkout
Disallow: /orders
Disallow: /login
Disallow: /dashboard
```

Public routes (`/`, `/activities`, `/activities/`, `/guides`, `/about`, `/faq`, `/legal/`) are explicitly allowed.
Sitemap link is present: `Sitemap: https://tour-platform-nine.vercel.app/sitemap.xml`

---

## sitemap.xml

**Status: PASS**

The sitemap contains only public static routes:
- `/` (priority 1.0)
- `/activities` (priority 0.9)
- `/guides` (priority 0.7)
- `/about`, `/faq` (priority 0.5)
- `/legal/privacy`, `/legal/terms`, `/legal/refund` (priority 0.3)

No internal routes (`/admin`, `/guide/`, `/booking/`, `/api/`, `/me/`, `/checkout`, `/orders`, `/login`) are present in the sitemap.

Note: Individual activity detail pages are not yet in the sitemap (dynamic generation not implemented). This is a "Future" backlog item.

---

## SEO/AEO Checklist Status

### Launch Blockers (require action before GA)

| Item | Status | Notes |
|------|--------|-------|
| XML Sitemap submitted to Google Search Console | Not yet | Manual step — submit at https://search.google.com/search-console |
| XML Sitemap submitted to Bing Webmaster Tools | Not yet | Manual step |
| Google Search Console verified | Not yet | Add property and verify |
| Canonical base URL consistent (`NEXT_PUBLIC_APP_URL`) | Check | Verify Vercel env var matches `https://tour-platform-nine.vercel.app` |
| Core Web Vitals — LCP < 2.5s | Not measured | Run PageSpeed Insights on home + activity detail |
| Activity detail JSON-LD `url` uses regionSlug not Chinese region | Minor | Backlog — not blocking schema validity |

### Nice-to-have Backlog (post-launch)

| Item | Notes |
|------|-------|
| FAQPage JSON-LD on `/faq` | Future — enables FAQ rich results |
| Person JSON-LD on guide profile pages | Future |
| ItemList JSON-LD on `/activities` listing | Future |
| `aggregateRating` in TouristAttraction schema | When review data is available |
| `offers` block in TouristAttraction schema | Richer price display in SERPs |
| `tourBookingPage` link in schema | Future |
| Activity detail pages in sitemap.xml | Dynamic generation needed |
| Meta title improvement for activity detail | Currently uses slug only (GH-502 constraint) |
| Hreflang | When English pages launch |
| GEO prose checklist (shortDescription, inclusions, FAQ fields) | Content ops task per activity |
| AEO FAQ entries per activity | Content ops task per activity |

---

## Source Code Verification

JSON-LD is injected in:
`apps/web/app/activities/[region]/[slug]/page.tsx` (lines 94–112)

The block is rendered server-side via `dangerouslySetInnerHTML` — correctly placed for crawler visibility without JavaScript execution.

---

## References

- PR #667 commit: `9a2c620`
- SEO/GEO/AEO checklist: `docs/operations/seo-geo-aeo-launch-checklist.md`
- Related: PR #664 (sitemap + robots.txt)
