import { expect, test } from '@playwright/test';

test.describe('Listing Detail page', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('https://images.unsplash.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.alloc(0) }),
    );
    await page.goto('/listing/lst_001');
    await page.waitForLoadState('networkidle');
  });

  test('listing detail screenshot', async ({ page }) => {
    await page.waitForSelector('text=Bright canal-side apartment', { timeout: 10_000 });
    await expect(page).toHaveScreenshot('listing-detail.png');
  });
});
