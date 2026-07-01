import { expect, test, type Page } from '@playwright/test';

/**
 * The intro tour. On web the first-run gate is intentionally disabled (it's the
 * demo/test surface), so the tour is reached by navigating to /onboarding
 * directly. All five pages are mounted side-by-side in one snapping pager, so a
 * page's text is in the DOM before it is on screen — each step therefore waits
 * for the page's heading to be *fully inside the viewport* (i.e. the pager
 * scroll has settled) before snapshotting.
 */
async function pageSettled(page: Page, heading: string) {
  await expect(page.getByText(heading)).toBeInViewport({ ratio: 1 });
  // The heading being visible doesn't mean the scroll animation has finished —
  // screenshots taken in its slow tail ghost the whole page sideways. Wait for
  // the pager to rest exactly on a page anchor.
  await page.waitForFunction(() => {
    const pager = [...document.querySelectorAll('div')].find((d) =>
      getComputedStyle(d).scrollSnapType.includes('x'),
    );
    if (!pager) return false;
    const width = pager.clientWidth || 1;
    return Math.abs(pager.scrollLeft - Math.round(pager.scrollLeft / width) * width) < 1;
  });
}

test.describe('Onboarding tour', () => {
  test('walks through the five intro pages', async ({ page }) => {
    await page.goto('/onboarding');
    await pageSettled(page, 'Welcome to Realty AI Canvas');
    await expect(page).toHaveScreenshot('onboarding-welcome.png');

    // There is no Continue button — advance one page per tap on the right
    // third of the page, on a passive spot below the content (1280×720
    // viewport: x > 853 is the right zone, y 600 sits above the bottom bar).
    const next = () => page.mouse.click(1150, 600);

    await next();
    await pageSettled(page, 'Everything you need to explore');
    await expect(page).toHaveScreenshot('onboarding-features.png');

    await next();
    await pageSettled(page, 'What are you looking for?');
    await expect(page).toHaveScreenshot('onboarding-filters.png');

    await next();
    await pageSettled(page, 'Pick your cities');
    await expect(page).toHaveScreenshot('onboarding-cities.png');

    await next();
    await pageSettled(page, 'Save your search');
    // The tour's single finishing action lives on this last page.
    await expect(page.getByText('Get started without account')).toBeVisible();
    await expect(page).toHaveScreenshot('onboarding-account.png');
  });

  test('swiping the pager anchors to the next page', async ({ page }) => {
    await page.goto('/onboarding');
    await pageSettled(page, 'Welcome to Realty AI Canvas');

    // A horizontal wheel gesture over the pager: past the midpoint the snap
    // anchors the next page, exactly like a touch swipe.
    await page.mouse.move(640, 360);
    await page.mouse.wheel(700, 0);
    await pageSettled(page, 'Everything you need to explore');

    // Back also stays in lockstep with the scroll position after a swipe.
    await page.getByText('Back', { exact: true }).click();
    await pageSettled(page, 'Welcome to Realty AI Canvas');
  });
});
