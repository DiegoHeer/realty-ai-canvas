import { expect, test } from '@playwright/test';

test.describe('Explore / Listings page', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('https://images.unsplash.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.alloc(0) }),
    );
    await page.goto('/explore');
    await page.waitForSelector('text=Listings', { timeout: 10_000 });
  });

  test('listings page screenshot', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('explore-page.png');
  });
});
