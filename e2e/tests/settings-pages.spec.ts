import { expect, test } from '@playwright/test';

// Each profile menu row now pushes a real page; capture them directly via their
// static-export routes. Light + dark baselines come from the two config projects.
//
// `maxDiffPixelRatio` overrides the strict global 0.01 for the text-dense pages
// (privacy/about/help). Baselines are generated on macOS but CI renders on
// Ubuntu, and cross-platform glyph antialiasing drifts ~2-3% of pixels on pages
// full of paragraph text — pure rendering noise, not layout/content changes
// (the lighter-text pages below stay strict). See CLAUDE.md "Visual regression".
const PAGES = [
  { path: '/settings/privacy', text: 'A zero-data company', name: 'privacy-page', maxDiffPixelRatio: 0.05 },
  { path: '/settings/about', text: 'Huismus', name: 'about-page', maxDiffPixelRatio: 0.05 },
  { path: '/settings/help', text: 'Frequently asked questions', name: 'help-page', maxDiffPixelRatio: 0.05 },
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
  for (const { path, text, name, maxDiffPixelRatio } of PAGES) {
    test(`${name} screenshot`, async ({ page }) => {
      await page.goto(path);
      await page.waitForSelector(`text=${text}`, { timeout: 10_000 });
      await expect(page).toHaveScreenshot(`${name}.png`, maxDiffPixelRatio ? { maxDiffPixelRatio } : {});
    });
  }
});
