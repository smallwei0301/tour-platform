'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { detectLocale } from '../../i18n/locale-path';
import { getFooterMessages } from '../../i18n/client-nav-messages';

// Footer 在 NextIntlClientProvider 之外（root layout 經 FooterGate 渲染），故與
// Navbar 同樣依 pathname 前綴自行決定 locale 與文案（#multilingual）。內部連結維持
// 不加前綴：未搬進 [locale] 的路徑不會 404，已搬進的靠 sticky NEXT_LOCALE cookie。
const FOOTER_REGIONS = [
  { key: 'taipei', region: '台北' }, { key: 'newTaipei', region: '新北' },
  { key: 'taoyuan', region: '桃園' }, { key: 'taichung', region: '台中' },
  { key: 'tainan', region: '台南' }, { key: 'kaohsiung', region: '高雄' },
  { key: 'hualien', region: '花蓮' }, { key: 'taitung', region: '台東' },
  { key: 'yilan', region: '宜蘭' }, { key: 'pingtung', region: '屏東' },
  { key: 'penghu', region: '澎湖' }, { key: 'kinmen', region: '金門' },
] as const;

export function Footer() {
  const pathname = usePathname() || '/';
  const m = getFooterMessages(detectLocale(pathname));
  return (
    <footer className="tp-footer">
      <div className="tp-container">
        <div className="tp-footer-main-grid">
          {/* Col 1: Brand + App download */}
          <section className="tp-footer-brand">
            <h3 className="tp-footer-logo">Midao 祕島</h3>
            <p>{m.tagline1}<br />{m.tagline2}</p>
            <div className="tp-footer-app-badges">
              <a href="#" className="tp-footer-app-badge" aria-label="App Store">
                <span>🍎</span>
                <div>
                  <small>Download on the</small>
                  <strong>App Store</strong>
                </div>
              </a>
              <a href="#" className="tp-footer-app-badge" aria-label="Google Play">
                <span>▶</span>
                <div>
                  <small>GET IT ON</small>
                  <strong>Google Play</strong>
                </div>
              </a>
            </div>
            <div className="tp-footer-social">
              <a href="#" aria-label="Facebook">FB</a>
              <a href="#" aria-label="Instagram">IG</a>
              <a href="#" aria-label="Line">LINE</a>
            </div>
          </section>

          {/* Col 2: Explore */}
          <section>
            <h4>{m.exploreHeading}</h4>
            <ul>
              <li><Link href="/activities">{m.allActivities}</Link></li>
              <li><Link href="/theme/cave-exploration">{m.themeCave}</Link></li>
              <li><Link href="/theme/river-trekking">{m.themeRiver}</Link></li>
              <li><Link href="/theme/culture-history">{m.themeCulture}</Link></li>
              <li><Link href="/theme/food-tour">{m.themeFood}</Link></li>
              <li><Link href="/theme/mountain-wilderness">{m.themeMountain}</Link></li>
            </ul>
          </section>

          {/* Col 3: Platform */}
          <section>
            <h4>{m.platformHeading}</h4>
            <ul>
              <li><Link href="/about">{m.about}</Link></li>
              <li><Link href="/guides">{m.guides}</Link></li>
              <li><Link href="/guide/apply">{m.becomeGuide}</Link></li>
              <li><Link href="/guide/new-activity">{m.submitActivity}</Link></li>
              <li><Link href="/blog">{m.blog}</Link></li>
              <li><Link href="/why-choose-us">{m.whyUs}</Link></li>
              <li><Link href="/contact">{m.contact}</Link></li>
            </ul>
            <h4 style={{ marginTop: 20 }}>{m.backstageHeading}</h4>
            <ul>
              <li><Link href="/guide/dashboard">{m.guideDashboard}</Link></li>
              <li><Link href="/admin">{m.adminConsole}</Link></li>
            </ul>
          </section>

          {/* Col 4: Support + Legal */}
          <section>
            <h4>{m.supportHeading}</h4>
            <ul>
              <li><Link href="/faq">{m.faq}</Link></li>
              <li><Link href="/orders">{m.orderLookup}</Link></li>
              <li><Link href="/contact">{m.customerService}</Link></li>
            </ul>
            <h4 style={{ marginTop: 20 }}>{m.legalHeading}</h4>
            <ul>
              <li><Link href="/legal/privacy">{m.privacy}</Link></li>
              <li><Link href="/legal/terms">{m.terms}</Link></li>
              <li><Link href="/legal/refund">{m.refund}</Link></li>
            </ul>
          </section>
        </div>

        {/* Region links */}
        <div className="tp-footer-regions-wrap">
          <p className="tp-footer-regions-title">{m.regionsTitle}</p>
          <div className="tp-footer-regions-list">
            {FOOTER_REGIONS.map((c) => (
              <Link
                key={c.key}
                href={`/activities?region=${encodeURIComponent(c.region)}`}
                className="tp-footer-region-link"
              >
                {m.region[c.key]}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="tp-footer-copy">
        {m.copy}
      </div>
    </footer>
  );
}
