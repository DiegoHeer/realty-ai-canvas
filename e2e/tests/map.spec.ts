import { expect, test } from '@playwright/test';

test.describe('Map page', () => {
  test('map page screenshot', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    await expect(page).toHaveScreenshot('map-page.png');
  });
});
