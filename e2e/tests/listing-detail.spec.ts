import { expect, test } from '@playwright/test';

import { stubApi } from '../fixtures';

test.describe('Listing Detail page', () => {
  test.beforeEach(async ({ page }) => {
    // Pin the clock so the relative "listed N ago" line is deterministic and the
    // screenshot baseline doesn't drift day to day. Set before navigation so the
    // first render already sees the fixed time.
    await page.clock.setFixedTime(new Date('2026-06-22T12:00:00Z'));
    await stubApi(page);
    // Residence id 1 in the fixtures (Prinsengracht 412); getListing fetches it
    // from the stubbed detail endpoint, /v1/residences/1.
    await page.goto('/listing/1');
    await page.waitForLoadState('networkidle');
  });

  test('listing detail screenshot', async ({ page }) => {
    await page.waitForSelector('text=Prinsengracht 412', { timeout: 10_000 });
    await expect(page).toHaveScreenshot('listing-detail.png');
  });
});
