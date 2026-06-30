import Script from 'next/script';

/**
 * Google Analytics 4（gtag.js）橋接元件。
 *
 * 在 App Router 下，root layout（app/layout.tsx）是唯一包住所有頁面的 layout，
 * 所以本元件只要在 root layout 的 <head> 內掛載一次，就等於「每一頁緊接在
 * <head> 之後都有、且只有一份」GA 代碼（符合 Google 安裝指引）。
 *
 * 用 next/script 取代手寫 <script>：Next.js 會負責 async 載入與去重，避免
 * App Router hydration 期間重複注入或執行順序問題。strategy="afterInteractive"
 * 讓 gtag.js 在頁面可互動後盡早載入，不阻擋首屏繪製。
 *
 * GA 評估 ID 預設為正式帳號 G-26EYTQJ9RC，可用 NEXT_PUBLIC_GA_ID 覆寫；
 * 設為空字串即停用（例如 preview / 測試環境不想污染正式報表時）。
 */
const DEFAULT_GA_ID = 'G-26EYTQJ9RC';

export function GoogleAnalytics() {
  const gaId =
    process.env.NEXT_PUBLIC_GA_ID === undefined
      ? DEFAULT_GA_ID
      : process.env.NEXT_PUBLIC_GA_ID.trim();

  if (!gaId) return null;

  return (
    <>
      {/* Google tag (gtag.js) */}
      <Script
        id="gtag-js"
        src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
        strategy="afterInteractive"
      />
      <Script id="gtag-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${gaId}');`}
      </Script>
    </>
  );
}
