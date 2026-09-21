import { test, expect } from '@playwright/test';

const PUBLIC = process.env.GAMEROAD_PUBLIC_BASE_URL || 'https://gameroad-browser-r5.pages.dev';
const VIEWPORTS = [
  ['desktop-1280x720', 1280, 720],
  ['phone-390x844', 390, 844],
  ['short-landscape-667x375', 667, 375],
];

test.use({ baseURL: PUBLIC, browserName: 'chromium', headless: true });

async function enterBattle(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('section[data-screen="home"]')).toBeVisible();
  await page.locator('[data-home-target="setup"]:visible').click();
  const setup = page.locator('section[data-screen="setup"]');
  await expect(setup).toBeVisible();
  await setup.locator('[data-content="road_shield"]').click();
  await setup.locator('[data-mode="2p"]').click();
  await expect(setup.locator('#startMatch')).toBeEnabled();
  await setup.locator('#startMatch').click();
  const battle = page.locator('section[data-screen="battle"]');
  await expect(battle).toBeVisible();
  const roleName = battle.locator('[data-role="advice-partner-name"]');
  const switcher = battle.locator('.partnerAdvicePartnerSwitch');
  for (let i = 0; i < 6; i += 1) {
    if ((await roleName.textContent())?.includes('サースナー')) break;
    if (await switcher.isVisible()) await switcher.click();
  }
  await expect(roleName).toContainText('サースナー');
  return battle;
}

async function assertInsideViewport(page, locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  const vp = page.viewportSize();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 1);
}

for (const [name, width, height] of VIEWPORTS) {
  test.describe(name, () => {
    test.use({ viewport: { width, height } });

    test('public Advice Saasuna motion + wind-cut', async ({ page }, testInfo) => {
      const battle = await enterBattle(page);
      const figure = battle.locator('[data-role="advice-partner-bustup"]');
      await expect(figure).toBeVisible();
      await expect(figure).toHaveAttribute('data-motion-state', /.+/);
      await assertInsideViewport(page, figure);
      const image = figure.locator('img:not([data-role="saasuna-motion-crossfade"])').first();
      await expect.poll(() => image.evaluate((n) => n.getAnimations().length)).toBeGreaterThan(0);
      await battle.locator('[data-quick-route="casual"]').click();
      await expect(figure).toHaveAttribute('data-motion-state', 'HAPPY_WAVE');
      const effect = figure.locator('[data-role="saasuna-motion-effect"]');
      await expect(effect).toHaveAttribute('data-kind', 'wind-cut');
      await expect(effect).toBeVisible();
      await testInfo.attach(name + '-normal.png', { body: await page.screenshot(), contentType: 'image/png' });
    });

    test('public Advice Saasuna reduced-motion preserves state without transient motion', async ({ page }, testInfo) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const battle = await enterBattle(page);
      const figure = battle.locator('[data-role="advice-partner-bustup"]');
      await expect(figure).toBeVisible();
      await assertInsideViewport(page, figure);
      await battle.locator('[data-quick-route="casual"]').click();
      await expect(figure).toHaveAttribute('data-motion-state', 'HAPPY_WAVE');
      const image = figure.locator('img:not([data-role="saasuna-motion-crossfade"])').first();
      await expect.poll(() => image.evaluate((n) => n.getAnimations().length)).toBe(0);
      const effect = figure.locator('[data-role="saasuna-motion-effect"]');
      await expect(effect).toBeHidden();
      await testInfo.attach(name + '-reduced.png', { body: await page.screenshot(), contentType: 'image/png' });
    });
  });
}
