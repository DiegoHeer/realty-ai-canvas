import { expect, test } from '@playwright/test';

import { stubApi } from '../fixtures';

test.describe('Explore / Listings page', () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
    await page.goto('/explore');
    await page.waitForSelector('text=Listings', { timeout: 10_000 });
  });

  test('listings page screenshot', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('explore-page.png');
  });
});
