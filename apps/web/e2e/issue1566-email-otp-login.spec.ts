import { test, expect } from '@playwright/test';

// Issue #1566（健檢 v2 P0-2）— Email OTP（magic link）登入入口。
// mock Supabase auth 的 OTP endpoint，不寄真信、不依賴外部。

test.describe('Issue #1566 — Email OTP 登入', () => {
  test('T1566.1 — 登入頁有 Email magic-link 入口（Google 之外）', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByTestId('google-login-btn')).toBeVisible();
    await expect(page.getByTestId('email-otp-input')).toBeVisible();
    await expect(page.getByTestId('email-otp-btn')).toBeVisible();
  });

  test('T1566.2 — 無效 Email → 不會送出（原生驗證＋JS EMAIL_RE 雙層擋）', async ({ page }) => {
    let otpCalled = false;
    await page.route('**/auth/v1/otp**', async (route) => {
      otpCalled = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    await page.goto('/login');
    await page.getByTestId('email-otp-input').fill('not-an-email');
    await page.getByTestId('email-otp-btn').click();
    // 不得進入「已寄送」狀態、表單仍在、未呼叫 OTP endpoint
    await expect(page.getByTestId('otp-sent-message')).toHaveCount(0);
    await expect(page.getByTestId('email-otp-form')).toBeVisible();
    expect(otpCalled).toBe(false);
  });

  test('T1566.3 — 有效 Email 送出 → 呼叫 signInWithOtp、顯示「檢查信箱」', async ({ page }) => {
    // 攔截 Supabase OTP endpoint（/auth/v1/otp），回成功
    let otpCalled = false;
    let sentBody: any = null;
    await page.route('**/auth/v1/otp**', async (route) => {
      otpCalled = true;
      try { sentBody = route.request().postDataJSON(); } catch { /* ignore */ }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
    });

    await page.goto('/login');
    await page.getByTestId('email-otp-input').fill('traveler1566@example.com');
    await page.getByTestId('email-otp-btn').click();

    await expect(page.getByTestId('otp-sent-message')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('otp-sent-message')).toContainText('traveler1566@example.com');
    expect(otpCalled).toBe(true);
    expect(sentBody?.email).toBe('traveler1566@example.com');
    // 送出後表單應消失（避免重複寄送）
    await expect(page.getByTestId('email-otp-form')).toHaveCount(0);
  });

  test('T1566.4 — 限流錯誤（429）→ 顯示「寄送太頻繁」', async ({ page }) => {
    await page.route('**/auth/v1/otp**', async (route) => {
      await route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ msg: 'rate limit exceeded' }) });
    });
    await page.goto('/login');
    await page.getByTestId('email-otp-input').fill('traveler1566@example.com');
    await page.getByTestId('email-otp-btn').click();
    await expect(page.getByTestId('otp-error')).toContainText('頻繁', { timeout: 10_000 });
  });
});
