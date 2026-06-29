import { expect, test } from '@playwright/test';

/**
 * The intro tour. On web the first-run gate is intentionally disabled (it's the
 * demo/test surface), so the tour is reached by navigating to /onboarding
 * directly. One page shows at a time; we step through with Continue and snapshot
 * each.
 */
test.describe('Onboarding tour', () => {
  test('walks through the five intro pages', async ({ page }) => {
    await page.goto('/onboarding');
    await page.waitForSelector('text=Welcome to Realty AI Canvas', { timeout: 10_000 });
    await expect(page).toHaveScreenshot('onboarding-welcome.png');

    // Bottom-bar primary button; exact match avoids the account page's
    // "Continue with Google/Apple" buttons.
    const next = page.getByText('Continue', { exact: true });

    await next.click();
    await page.waitForSelector('text=Everything you need to explore');
    await expect(page).toHaveScreenshot('onboarding-features.png');

    await next.click();
    await page.waitForSelector('text=What are you looking for?');
    await expect(page).toHaveScreenshot('onboarding-filters.png');

    await next.click();
    await page.waitForSelector('text=Pick your cities');
    await expect(page).toHaveScreenshot('onboarding-cities.png');

    await next.click();
    await page.waitForSelector('text=Save your search');
    await expect(page).toHaveScreenshot('onboarding-account.png');
  });
});
