import { expect, test } from '@playwright/test';

import { stubApi } from '../fixtures';

test.describe('Explore / Listings page', () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
    await page.goto('/explore');
    // The old "Listings" title is now the sort dropdown button.
    await page.getByTestId('sort-button').waitFor({ timeout: 10_000 });
  });

  test('listings page screenshot', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('explore-page.png');
  });

  test('sort dropdown open screenshot', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    await page.getByTestId('sort-button').click();
    // Wait for the menu to render before snapshotting.
    await page.getByTestId('sort-option-oldest').waitFor();
    await expect(page).toHaveScreenshot('explore-sort-menu.png');
  });
});
