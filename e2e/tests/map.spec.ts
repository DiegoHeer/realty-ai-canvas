import { expect, test } from '@playwright/test';

import { stubApi } from '../fixtures';

test.describe('Map page', () => {
  test('map page screenshot', async ({ page }) => {
    await stubApi(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    await expect(page).toHaveScreenshot('map-page.png');
  });
});
