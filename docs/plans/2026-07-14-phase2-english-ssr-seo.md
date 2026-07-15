# English SSR SEO Implementation Plan

> **For Hermes:** Execute one TDD slice at a time; Phase 2 may only hand off to Rita after every item is green.

**Goal:** Make `/en` public pages genuinely indexable English variants: English SSR document language and metadata, reciprocal hreflang, and sitemap coverage without breaking locale routing or ISR.

**Architecture:** Replace the single Chinese root document with two static root-layout trees. `app/[locale]/layout.tsx` becomes the locale root document and receives its language only from route params; non-locale UI routes move under `(non-locale)` with a fixed Chinese root. A shared `RootDocument` keeps shell, font, analytics, and global metadata behavior identical. No `headers()`, `cookies()`, or middleware change is permitted.

**Tech stack:** Next.js App Router, next-intl, React, Node test runner, Playwright.

---

### Task 1: Prove the SSR language gap

**Files:**
- Modify: `apps/web/e2e/issue1569-html-lang-locale.spec.ts`

1. Add raw-response assertions for `/`, `/en`, and `/en/activities` using `page.goto()` response body or request context; do not rely on hydrated DOM.
2. Run the single test and record RED: the current raw `/en` HTML is `lang="zh-Hant"`.
3. Retain the existing post-hydration accessibility assertions as a separate check.

### Task 2: Extract a static shared document shell

**Files:**
- Create: `apps/web/src/components/layout/RootDocument.tsx`
- Create: `apps/web/src/lib/seo/site-metadata.ts`
- Test: Task 1 test and focused shell/source contract test.

1. Write a failing contract test requiring a `lang` prop and prohibiting request dynamic APIs in `RootDocument`.
2. Move fonts, global CSS import ownership, analytics, preconnects, skip link, Navbar, FooterGate, and body classes from `app/layout.tsx` into the shell.
3. Extract root metadata unchanged to `site-metadata.ts`.
4. Verify shell test turns GREEN.

### Task 3: Establish static locale and non-locale roots

**Files:**
- Modify: `apps/web/app/[locale]/layout.tsx`
- Create: `apps/web/app/(non-locale)/layout.tsx`
- Delete: `apps/web/app/layout.tsx`
- Move: `apps/web/app/{admin,booking,for-guides,guide,guides,line,login,maintenance,me,order}` to `apps/web/app/(non-locale)/`
- Move/re-export route-local error and not-found boundaries as required.

1. First add a failing source contract asserting `app/[locale]/layout.tsx` renders `RootDocument` with `HTML_LANG[locale]`, and that the top-level fixed Chinese root no longer exists.
2. Make `[locale]` the locale root document, using only validated route params, `setRequestLocale`, and `HTML_LANG`; remove `HtmlLangSync` from the layout.
3. Add the fixed Chinese non-locale root and move non-locale UI route trees with `git mv`.
4. Repair relative imports mechanically and verify route URLs remain unchanged.
5. Run raw SSR test until GREEN.

### Task 4: Preserve ISR and route boundaries

**Files:**
- Test: `apps/web/e2e/issue1569-html-lang-locale.spec.ts`
- Test: `apps/web/e2e/i18n-poc-locale-routing.spec.ts`
- Test: affected existing booking/shop/admin route smoke tests.

1. Run build/start-backed assertions for `/en`, `/en/activities`, and an activity detail: initial HTML language is English and requests do not fail with `DYNAMIC_SERVER_USAGE`.
2. Assert representative non-locale URLs remain unprefixed and Chinese-document rooted.
3. Verify `revalidate` and `fetchCache` remain intact in public ISR pages.

### Task 5: Localize English public-page metadata

**Files:**
- Modify: `apps/web/app/[locale]/page.tsx`
- Modify: `apps/web/app/[locale]/activities/page.tsx`
- Test: `apps/web/tests/api/issue626-seo-metadata.test.mjs` (or a focused new runtime/contract test).

1. Add failing assertions that `/en` and `/en/activities` emit English title, description, Open Graph text, and JSON-LD labels from `messages/en.json`.
2. Replace hard-coded Chinese metadata with locale-aware `getTranslations` values.
3. Verify English message catalog has no fallback Chinese values for SEO namespaces used by indexable pages.
4. Run focused metadata tests GREEN.

### Task 6: Make sitemap and hreflang reciprocal only after SSR/content verification

**Files:**
- Modify: `apps/web/src/lib/seo-alternates.ts`
- Modify: `apps/web/app/sitemap.ts`
- Test: `apps/web/tests/unit/seo-alternates.test.mjs`
- Test: `apps/web/tests/api/issue829-sitemap-activities.test.mjs`
- Test: `apps/web/tests/api/issue944-sitemap-experience-guide.test.mjs`

1. Add failing tests for reciprocal `zh-Hant`/`en` entries, absolute sitemap languages, `x-default`, and no ja/ko leakage.
2. Implement one shared sitemap locale-entry rule; avoid independently diverging maps.
3. Verify sitemap output has one valid URL per publicly indexable locale/version and alternates are reciprocal.

### Task 7: Validate and hand off Phase 2

1. Run `git diff --check`.
2. Run all focused SEO, i18n, raw SSR, route-boundary, and sitemap tests.
3. Run `npm run test -w @tour/web` with the documented CI-safe environment variables.
4. Attempt typecheck and report baseline dependency gaps separately if still present.
5. Commit only Phase 2 files, push PR #1711, wait for required checks, prepare full Rita evidence packet, and stop until a new exact-head `passed: true` verdict.
