import { expect, test } from '@playwright/test';

test.describe('Profile page', () => {
  test('profile page screenshot', async ({ page }) => {
    await page.goto('/profile');
    await page.waitForSelector('text=Profile', { timeout: 10_000 });
    await expect(page).toHaveScreenshot('profile-page.png');
  });
});
