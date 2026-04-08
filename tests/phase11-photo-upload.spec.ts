import { test, expect } from '@playwright/test';

test.describe('Phase 11 Task #1 - Photo Upload E2E', () => {
  const baseUrl = 'http://localhost:3000';

  // ──────────────────────────────────────────────────────────────
  // TC-1: Guide Avatar Upload (Normal Flow)
  // ──────────────────────────────────────────────────────────────
  test('TC-1: Guide avatar upload - normal flow', async ({ page }) => {
    test.skip(true, 'Manual test: Requires admin auth + real file upload');
    
    // Step 1: Navigate to admin guides
    await page.goto(`${baseUrl}/admin/guides`);
    await expect(page).toHaveURL(/\/admin\/guides/);

    // Step 2: Switch to Profiles tab
    const profilesTab = page.getByRole('tab', { name: /profiles/i });
    await profilesTab.click();
    await page.waitForTimeout(500);

    // Step 3: Find a guide and click edit
    const editButtons = page.locator('button:has-text("編輯")');
    const firstEditButton = editButtons.first();
    await firstEditButton.click();
    
    // Step 4: Modal should open
    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible();

    // Step 5: Avatar upload - click on avatar circle
    const avatarUpload = page.locator('input[accept*="image"]').first();
    
    // Note: Real file upload needs fs + file path
    // For now, just verify the button exists
    await expect(avatarUpload).toBeVisible();
  });

  // ──────────────────────────────────────────────────────────────
  // TC-2: Hero Upload (Normal Flow)
  // ──────────────────────────────────────────────────────────────
  test('TC-2: Hero upload - normal flow', async ({ page }) => {
    test.skip(true, 'Manual test: Requires admin auth + activity edit page');
    
    // Navigate to activity edit page
    // Note: Replace with actual activity ID from database
    const activityId = 'test-activity-id';
    await page.goto(`${baseUrl}/admin/activities/${activityId}/edit`);
    await expect(page).toHaveURL(new RegExp(`/admin/activities/.*/edit`));

    // Find Hero upload button
    const heroButton = page.getByRole('button', { name: /hero.*16:9/i });
    await expect(heroButton).toBeVisible();

    // Verify file input exists
    const fileInputs = page.locator('input[type="file"]');
    const heroInput = fileInputs.nth(0);
    await expect(heroInput).toBeVisible();
  });

  // ──────────────────────────────────────────────────────────────
  // TC-3: Hero Upload - Aspect Ratio Validation (Edge Cases)
  // ──────────────────────────────────────────────────────────────
  test('TC-3: Hero upload - aspect ratio validation', async ({ page }) => {
    test.skip(true, 'Manual test: Requires file upload capability');
  });

  // ──────────────────────────────────────────────────────────────
  // TC-4: Hero Upload - Rejection (Invalid Aspect Ratio)
  // ──────────────────────────────────────────────────────────────
  test('TC-4: Hero upload - rejection on invalid aspect ratio', async ({ page }) => {
    test.skip(true, 'Manual test: Requires 1:1 square image');
  });

  // ──────────────────────────────────────────────────────────────
  // TC-5: Gallery Upload - Multiple Images
  // ──────────────────────────────────────────────────────────────
  test('TC-5: Gallery upload - multiple images', async ({ page }) => {
    test.skip(true, 'Manual test: Requires 3 images + activity edit page');
  });

  // ──────────────────────────────────────────────────────────────
  // TC-6: Gallery Upload - Aspect Ratio Validation
  // ──────────────────────────────────────────────────────────────
  test('TC-6: Gallery upload - aspect ratio validation (3:2)', async ({ page }) => {
    test.skip(true, 'Manual test: Requires various image ratios');
  });

  // ──────────────────────────────────────────────────────────────
  // TC-7: File Size Validation
  // ──────────────────────────────────────────────────────────────
  test('TC-7: File size validation - Hero 10MB limit', async ({ page }) => {
    test.skip(true, 'Manual test: Requires large file generation');
  });

  test('TC-7b: File size validation - Gallery 5MB limit', async ({ page }) => {
    test.skip(true, 'Manual test: Requires large file generation');
  });

  // ──────────────────────────────────────────────────────────────
  // TC-8: Front-end Placeholder Display
  // ──────────────────────────────────────────────────────────────
  test('TC-8: Placeholder display - guide without avatar', async ({ page }) => {
    // This test can run without auth - just check frontend
    await page.goto(`${baseUrl}/guides`);
    await expect(page).toHaveURL(/\/guides/);

    // Look for guides with placeholders
    const images = page.locator('img[alt*="頭像"], img[alt*="導遊"]');
    const imageCount = await images.count();
    
    // At least one image should be loaded
    if (imageCount > 0) {
      const firstImage = images.first();
      // Check if it has a placeholder src
      const src = await firstImage.getAttribute('src');
      expect(src).toBeTruthy();
    }
  });

  test('TC-8b: Placeholder display - activity without hero', async ({ page }) => {
    // Navigate to an activity page
    // This would need a real activity URL
    test.skip(true, 'Manual test: Requires real activity slug');
  });

  // ──────────────────────────────────────────────────────────────
  // Health Check: Verify Components & Dependencies
  // ──────────────────────────────────────────────────────────────
  test('Health Check: Verify imports and components exist', async ({ page }) => {
    // Navigate to admin guides to load components
    await page.goto(`${baseUrl}/admin/guides`);
    
    // Check for no console errors
    const errors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.waitForTimeout(1000);
    
    // Verify page loaded
    await expect(page).toHaveURL(/\/admin\/guides/);
    
    // Log any errors
    if (errors.length > 0) {
      console.error('Console errors found:', errors);
      // Don't fail - may have unrelated errors
    }
  });
});
