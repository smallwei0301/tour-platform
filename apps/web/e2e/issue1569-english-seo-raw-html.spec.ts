import { test, expect } from '@playwright/test';

test.describe('English public SEO raw HTML', () => {
  test.setTimeout(120_000);
  test('/en emits English title and description before hydration', async ({ request }) => {
    const response = await request.get('/en');
    const html = await response.text();

    expect(response.ok()).toBeTruthy();
    expect(html).toContain('<html lang="en"');
    expect(html).toContain('<title>Midao — Hidden Taiwan, by those who know</title>');
    expect(html).toContain('content="Book real local guides and the routes no guidebook tells you. Discover hidden Taiwan, book directly, pay securely."');
  });

  test('/en/activities emits English title and description before hydration', async ({ request }) => {
    const response = await request.get('/en/activities');
    const html = await response.text();

    expect(response.ok()).toBeTruthy();
    expect(html).toContain('<html lang="en"');
    expect(html).toContain('<title>Explore Routes | Midao 祕島 | Midao — Local Guides in Taiwan</title>');
    expect(html).toContain('content="Browse private local-guide tours across Taiwan."');
  });
});
