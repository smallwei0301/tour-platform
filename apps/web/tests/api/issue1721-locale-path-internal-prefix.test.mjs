// issue1721：LanguageSwitcher 改 <a href> 後，href 由 SSR 期的 usePathname() 計算，
// 而 middleware(next-intl) 改寫會讓預設語系路徑帶顯式內部前綴（/zh-Hant/...）。
// pathForLocale 必須把「任何合法 locale 首段」剝掉，否則 SSR href 會輸出
// /zh-Hant/... 與 /en/zh-Hant/... 的錯誤連結（爬蟲照抓 → 404/重複內容）。
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { pathForLocale, detectLocale } from '../../src/i18n/locale-path.ts';

describe('issue1721: pathForLocale 對內部改寫路徑（顯式預設語系前綴）', () => {
  it('SSR 內部路徑 /zh-Hant/activities → zh 連結為 /activities', () => {
    assert.equal(pathForLocale('/zh-Hant/activities', 'zh-Hant'), '/activities');
  });

  it('SSR 內部路徑 /zh-Hant/activities → en 連結為 /en/activities（不得出現 /en/zh-Hant）', () => {
    assert.equal(pathForLocale('/zh-Hant/activities', 'en'), '/en/activities');
  });

  it('SSR 內部路徑 /zh-Hant（首頁）→ zh 為 /、en 為 /en', () => {
    assert.equal(pathForLocale('/zh-Hant', 'zh-Hant'), '/');
    assert.equal(pathForLocale('/zh-Hant', 'en'), '/en');
  });

  it('瀏覽器路徑（無前綴）行為不變：/activities ↔ /en/activities', () => {
    assert.equal(pathForLocale('/activities', 'en'), '/en/activities');
    assert.equal(pathForLocale('/en/activities', 'zh-Hant'), '/activities');
    assert.equal(pathForLocale('/', 'en'), '/en');
    assert.equal(pathForLocale('/en', 'zh-Hant'), '/');
  });

  it('detectLocale 不受影響：顯式 zh-Hant 前綴仍判為 zh-Hant', () => {
    assert.equal(detectLocale('/zh-Hant/activities'), 'zh-Hant');
    assert.equal(detectLocale('/en/activities'), 'en');
    assert.equal(detectLocale('/activities'), 'zh-Hant');
  });
});
