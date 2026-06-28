import { expect, test } from '@playwright/test';

// Each profile menu row now pushes a real page; capture them directly via their
// static-export routes. Light + dark baselines come from the two config projects.
const PAGES = [
  { path: '/settings/privacy', text: 'A zero-data company', name: 'privacy-page' },
  { path: '/settings/about', text: 'Realty AI Canvas', name: 'about-page' },
  { path: '/settings/help', text: 'Frequently asked questions', name: 'help-page' },
  {
    path: '/settings/subscription',
    text: 'Subscription and payment methods coming soon.',
    name: 'subscription-page',
  },
  {
    path: '/settings/notifications',
    text: 'Notification settings coming soon.',
    name: 'notifications-page',
  },
];

test.describe('Settings pages', () => {
  for (const { path, text, name } of PAGES) {
    test(`${name} screenshot`, async ({ page }) => {
      await page.goto(path);
      await page.waitForSelector(`text=${text}`, { timeout: 10_000 });
      await expect(page).toHaveScreenshot(`${name}.png`);
    });
  }
});
