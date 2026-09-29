import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT = path.resolve(process.cwd(), 'setup-current-evidence');
const VIEWS = [
  { name: 'desktop-1280x720', width: 1280, height: 720 },
  { name: 'short-844x390', width: 844, height: 390 },
  { name: 'phone-390x844', width: 390, height: 844 },
];

function setupControl(page) {
  return page.locator('[data-home-target="setup"]:visible, [data-go="setup"]:visible').first();
}

async function enterFreshSetup(page) {
  const response = await page.goto('/browser/GAMEROAD.html', { waitUntil: 'commit' });
  expect(response).not.toBeNull();
  expect(response.ok()).toBeTruthy();
  await expect(page.locator('section[data-screen="home"]')).toBeVisible({ timeout: 15_000 });
  const control = setupControl(page);
  await expect(control).toBeVisible({ timeout: 15_000 });
  await control.click();
  const setup = page.locator('section[data-screen="setup"]');
  await expect(setup).toBeVisible({ timeout: 15_000 });
  return setup;
}

async function assertFreshDefaults(page, setup) {
  const honey = setup.locator('[data-content="honey_hunt"]');
  const four = setup.locator('[data-mode="4p"]');
  const start = setup.locator('#startMatch');
  await expect(honey).toHaveClass(/on/);
  await expect(four).toHaveClass(/on/);
  await expect(honey).toHaveAttribute('aria-pressed', 'true');
  await expect(four).toHaveAttribute('aria-pressed', 'true');
  await expect(start).toBeVisible();
  await expect(start).toBeEnabled();
  const trigger = page.locator('#gameroadSetupQuickDeckTrigger');
  await expect(trigger).toBeVisible({ timeout: 15_000 });
  return { honey, four, start, trigger };
}

test('captures exact-current fresh Setup defaults and Quick Deck', async ({ browser }) => {
  await mkdir(OUT, { recursive: true });
  const report = { sourceSha: process.env.GITHUB_SHA ?? null, viewports: {}, reducedMotion: null };

  for (const view of VIEWS) {
    const context = await browser.newContext({ viewport: { width: view.width, height: view.height } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    const setup = await enterFreshSetup(page);
    const { start, trigger } = await assertFreshDefaults(page, setup);

    const state = await page.evaluate(() => {
      const s = globalThis.__GAMEROAD_TEST__?.state;
      return s ? {
        setupMode: s.setupMode,
        setupContent: s.setupContent,
        savedMainCount: Array.isArray(s.savedDeck?.main) ? s.savedDeck.main.length : null,
        savedExCount: Array.isArray(s.savedDeck?.ex) ? s.savedDeck.ex.length : null,
        savedDeckRule: s.savedDeckRule ?? null,
      } : null;
    });

    const startBox = await start.boundingBox();
    expect(startBox).not.toBeNull();
    expect(startBox.y).toBeGreaterThanOrEqual(0);
    expect(startBox.y + startBox.height).toBeLessThanOrEqual(view.height + 1);

    const setupMetrics = await setup.evaluate((node) => ({
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
      scrollHeight: node.scrollHeight,
      clientHeight: node.clientHeight,
    }));

    const pngPath = path.join(OUT, view.name + '-setup.png');
    await page.screenshot({ path: pngPath, fullPage: false, animations: 'disabled' });

    report.viewports[view.name] = {
      viewport: { width: view.width, height: view.height },
      state,
      startBox,
      setupMetrics,
      pageErrors: [...pageErrors],
      quickDeck: null,
    };

    if (view.name === 'short-844x390') {
      await trigger.click();
      const dialog = page.locator('#gameroadSetupQuickDeckDialog');
      await expect(dialog).toBeVisible();
      const summary = (await dialog.locator('.setupQuickDeckSummary').textContent())?.trim() ?? '';
      expect(summary).toContain('メイン 40枚');
      const mainCards = await dialog.locator('.setupQuickDeckSection').first().locator('.setupQuickDeckCard').count();
      expect(mainCards).toBe(40);
      await page.screenshot({
        path: path.join(OUT, view.name + '-quick-deck.png'),
        fullPage: false,
        animations: 'disabled',
      });
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      report.viewports[view.name].quickDeck = { summary, mainCards, escapeClosed: true };
    }

    expect(pageErrors).toEqual([]);
    await context.close();
  }

  {
    const context = await browser.newContext({
      viewport: { width: 844, height: 390 },
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const setup = await enterFreshSetup(page);
    const { honey, four, start } = await assertFreshDefaults(page, setup);
    const motion = await page.evaluate(() => {
      const h = document.querySelector('section[data-screen="setup"] [data-content="honey_hunt"]');
      const f = document.querySelector('section[data-screen="setup"] [data-mode="4p"]');
      const s = document.querySelector('section[data-screen="setup"] #startMatch');
      return {
        honeyAnimation: h ? getComputedStyle(h).animationName : null,
        fourAnimation: f ? getComputedStyle(f).animationName : null,
        startBeforeAnimation: s ? getComputedStyle(s, '::before').animationName : null,
      };
    });
    await expect(honey).toHaveClass(/on/);
    await expect(four).toHaveClass(/on/);
    await expect(start).toBeEnabled();
    expect(motion.startBeforeAnimation === 'none' || motion.startBeforeAnimation === '').toBeTruthy();
    await page.screenshot({
      path: path.join(OUT, 'short-844x390-reduced-motion.png'),
      fullPage: false,
      animations: 'disabled',
    });
    report.reducedMotion = motion;
    await context.close();
  }

  await writeFile(path.join(OUT, 'setup-current-evidence.json'), JSON.stringify(report, null, 2));
});
