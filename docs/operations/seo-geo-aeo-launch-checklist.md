# SEO / GEO / AEO Launch Checklist — Midao 祕島

Issue: #637
Last updated: 2026-05-22

---

## Overview

Three optimization layers for the Midao platform:

- **SEO** (Search Engine Optimization): signals for Google/Bing crawlers — meta tags, structured data, sitemap, robots.txt.
- **GEO** (Generative Engine Optimization): signals for AI search engines (ChatGPT, Perplexity, Gemini) — clear, complete, scannable prose that an LLM can cite and summarize.
- **AEO** (Answer Engine Optimization): signals for featured snippets and voice assistants — direct answers to "how much / what's included / where / how long" questions.

---

## 1. Infrastructure Checklist (once, not per-page)

| Item | Status | Notes |
|---|---|---|
| `robots.txt` present and correct | Done (#626) | Verify it allows all important paths and disallows `/admin`, `/api` |
| XML Sitemap generated and submitted | Check | Should be at `/sitemap.xml`; submit to Google Search Console and Bing Webmaster Tools |
| Canonical base URL consistent | Check | `NEXT_PUBLIC_APP_URL` must match production domain in Vercel env vars |
| Google Search Console verified | Check | Add property, verify via HTML tag or DNS |
| Bing Webmaster Tools verified | Check | Import from GSC or add separately |
| Core Web Vitals — LCP < 2.5 s | Check | Run Lighthouse on home + activity detail; fix largest paint issues |
| HTTPS enforced | Done | Vercel auto-provides TLS |
| Hreflang (if multilingual) | Future | Not needed yet; add when English pages launch |

---

## 2. Page-by-Page SEO Checklist

For each public page, verify the following:

### Meta title
- Format: `{Page-specific title} | Midao 祕島`
- Home: `探索台灣秘境 | Midao 祕島`
- Activity list: `台灣在地小旅行 — 所有行程 | Midao 祕島`
- Activity detail: `{activity.title} — {activity.region} | Midao 祕島` *(currently uses slug only — improve in future issue)*
- Guide profile: `{guide.displayName} 的導遊簡介 | Midao 祕島`
- FAQ: `常見問題 | Midao 祕島`
- Length: 50–60 characters

### Meta description
- Unique per page; 120–160 characters
- Activity detail: include region, duration, price, key highlight
- Example: `在{region}體驗{title}，全程約{durationDisplay}，每人 NT${priceTwd} 起。包含{top inclusion}，立即預約！`

### Open Graph tags
- `og:title` — same as meta title
- `og:description` — same as meta description
- `og:image` — use `activity.coverImageUrl`; recommended 1200×630 px
- `og:type` — `website` for home/list, consider `product` for activity detail
- `og:url` — canonical URL

### Twitter Card
- `twitter:card: summary_large_image`
- `twitter:title` and `twitter:description` — same as OG
- `twitter:image` — same as OG image

### Canonical URL
- Every page must have `<link rel="canonical" href="...">` pointing to itself
- Activity detail canonical: `https://{domain}/activities/{region}/{slug}`
- Prevents duplicate-content issues from query-string variants

---

## 3. Structured Data (JSON-LD) Checklist

### Activity detail page — TouristAttraction (Done in #637)

The following JSON-LD is now injected at the top of `ActivityDetailPage`:

```json
{
  "@context": "https://schema.org",
  "@type": "TouristAttraction",
  "name": "<activity.title>",
  "description": "<activity.shortDescription or title>",
  "url": "https://<domain>/activities/<region>/<slug>",
  "image": "<activity.coverImageUrl>",
  "priceRange": "NT$<priceTwd>起",
  "address": {
    "@type": "PostalAddress",
    "addressRegion": "<activity.region>",
    "addressCountry": "TW"
  }
}
```

Validate with: https://validator.schema.org/

**Future enhancements:**
- Add `aggregateRating` when reviews are available: `{ "@type": "AggregateRating", "ratingValue": X, "reviewCount": N }`
- Add `offers` for richer price display: `{ "@type": "Offer", "price": X, "priceCurrency": "TWD", "availability": "https://schema.org/InStock" }`
- Add `tourBookingPage` pointing to the booking URL

### FAQ page — FAQPage schema

Add JSON-LD on the `/faq` page:

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "如何預約行程？",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "選擇行程後點擊「立即預約」，填寫人數與日期，完成付款即完成預約。"
      }
    }
  ]
}
```

This enables Google to display FAQ rich results directly in search.

### Guide profile page — Person schema

```json
{
  "@context": "https://schema.org",
  "@type": "Person",
  "name": "<guide.displayName>",
  "description": "<guide.bio>",
  "url": "https://<domain>/guides/<guide.slug>",
  "image": "<guide.profilePhotoUrl>",
  "jobTitle": "在地導遊",
  "address": {
    "@type": "PostalAddress",
    "addressRegion": "<guide.region>",
    "addressCountry": "TW"
  }
}
```

### Home / Activity list — ItemList schema (future)

Consider adding `ItemList` JSON-LD on `/activities` listing all activities with `ListItem` entries. This helps Google understand the catalogue.

---

## 4. GEO — Generative Engine Optimization Checklist

AI search engines (ChatGPT Browse, Perplexity, Gemini) cite content that is:
- Written in clear, complete sentences
- Structured with headings and lists
- Directly answers common traveler questions

### Activity detail page

- [ ] `shortDescription` exists and is a 1–2 sentence summary in plain language
- [ ] `description` field answers: what you do, where you go, what makes it special
- [ ] `inclusions` list is complete: transport, meals, equipment, guide, tickets
- [ ] `exclusions` list is explicit: personal insurance, additional meals, tips
- [ ] `durationDisplay` is human-readable (e.g. "約 4 小時", not "240")
- [ ] `region` matches a recognizable Taiwan location name
- [ ] `notices` cover: minimum age, fitness level, weather policy, meeting point
- [ ] `faq` array has at least 5 Q&A pairs covering: booking, payment, cancellation, meeting point, what to bring

### Activities listing page (`/activities`)

- [ ] Page includes a prose intro (2–3 sentences) describing what Midao is and who it's for
- [ ] Region filter labels use full names (台北, 花蓮, not abbreviations)
- [ ] Each activity card shows: title, region, duration, price, short description

### Home page

- [ ] Hero section includes a clear H1 describing the platform in one sentence
- [ ] "What is Midao?" section (even brief) helps AI understand the product category
- [ ] Key trust signals in text (not just images): "認證導遊", "台灣在地行程", "安全付款"

---

## 5. AEO — Answer Engine Optimization Checklist

AEO focuses on answering the specific questions travelers ask. Each question type maps to a schema or content pattern:

### Price questions: "How much does X cost?"

- [ ] Activity detail shows price prominently in text (not only in CSS/JS)
- [ ] `priceRange` in JSON-LD is present (`NT$XXX起`)
- [ ] FAQ entry: "這個行程多少錢？" with exact price and what's included

### Location / logistics questions: "Where does X start?"

- [ ] Meeting point is in the `notices` or `description` field in plain text
- [ ] `address.addressRegion` in JSON-LD matches the meeting area
- [ ] FAQ entry: "集合地點在哪裡？" with address or landmark

### Availability questions: "Can I book X for [date]?"

- [ ] Activity detail links to booking flow
- [ ] FAQ entry: "如何查看可預約日期？" with clear instructions

### Inclusion questions: "Does X include [meals/transport/equipment]?"

- [ ] `inclusions` and `exclusions` lists are complete and use plain language
- [ ] FAQ entry: "行程包含什麼？" with a summary answer

### Cancellation questions: "What is the cancellation policy?"

- [ ] `refundRules` list present and in plain language
- [ ] FAQ entry: "可以取消嗎？退款政策是什麼？"

### Guide questions: "Who is my guide?"

- [ ] Guide section on activity detail is complete: name, rating, region, bio headline
- [ ] Link to guide profile page

---

## 6. Public Pages Review Checklist

| Page | Meta title | Meta desc | OG image | Canonical | JSON-LD | GEO prose | AEO FAQ |
|---|---|---|---|---|---|---|---|
| Home `/` | Check | Check | Check | Check | — | Check | — |
| Activities list `/activities` | Check | Check | Check | Check | ItemList (future) | Check | — |
| Activity detail `/activities/[region]/[slug]` | Improve* | Improve* | Check | Check | **Done (#637)** | Check | Check |
| Guide profile `/guides/[slug]` | Check | Check | Check | Check | Person (future) | Check | — |
| FAQ `/faq` | Check | Check | — | Check | FAQPage (future) | — | Check |
| Legal `/legal` | Check | Check | — | Check | — | — | — |
| About (if exists) | Check | Check | Check | Check | Organization (future) | Check | — |

*Activity detail `generateMetadata` currently uses slug only (GH-502 constraint); improve when safe to do a lightweight DB lookup in metadata.

---

## 7. Validation Tools

| Tool | Purpose | URL |
|---|---|---|
| Schema.org Validator | Validate JSON-LD | https://validator.schema.org/ |
| Google Rich Results Test | Preview rich snippets | https://search.google.com/test/rich-results |
| Google Search Console | Index status, Core Web Vitals | https://search.google.com/search-console |
| Open Graph Debugger | Preview OG cards | https://developers.facebook.com/tools/debug/ |
| Twitter Card Validator | Preview Twitter cards | https://cards-dev.twitter.com/validator |
| PageSpeed Insights | Core Web Vitals | https://pagespeed.web.dev/ |
| Ahrefs / Semrush | Keyword tracking (paid) | — |

---

## 8. Ongoing Maintenance

- After adding new activities: verify `shortDescription`, `inclusions`, `faq` fields are filled before publishing
- After design changes: re-check Core Web Vitals with PageSpeed Insights
- Monthly: review Search Console for crawl errors, coverage drops, and new queries to add to FAQ
- When adding new page types: add JSON-LD schema appropriate for that type
