import { test, expect } from '@playwright/test';

const RANK_ASSETS = [
  'waiting-bg.webp',
  'ui-chrome.webp',
  'partner-picker.webp',
  'picker-modal.webp',
  'picker-tile-selected.webp',
  'button-primary.webp',
  'button-secondary.webp',
  'action-ring.webp',
  'waiting-vfx.webp',
];

function visibleHomeBattle(page) {
  return page.locator('[data-home-target="battle"]:visible, [data-go="battle"]:visible').first();
}

async function enterRankWaiting(page) {
  const response = await page.goto('/browser/GAMEROAD.html', { waitUntil: 'commit' });
  expect(response, 'GAMEROAD HTML response').not.toBeNull();
  expect(response.ok(), `GAMEROAD HTML status ${response.status()}`).toBeTruthy();

  const home = page.locator('section[data-screen="home"]');
  await expect(home).toBeVisible({ timeout: 15_000 });
  await expect(home.locator('.codexBattleCrest, .codexRankLabel')).toHaveCount(0);

  const battleEntry = visibleHomeBattle(page);
  await expect(battleEntry).toBeVisible();
  await battleEntry.click();

  const setup = page.locator('section[data-screen="setup"]');
  await expect(setup).toBeVisible({ timeout: 10_000 });

  const rank = setup.locator('button[data-rank-mode="rank"]');
  await expect(rank).toBeVisible();
  await rank.click();
  await expect(rank).toHaveAttribute('aria-pressed', 'true');
  await expect(setup.locator('#startMatch')).toHaveText('ランクマッチ待機へ');
  await setup.locator('#startMatch').click();

  const battle = page.locator('section[data-screen="battle"]');
  await expect(battle).toBeVisible({ timeout: 10_000 });
  await expect(battle).toHaveAttribute('data-rank-waiting', 'true', { timeout: 10_000 });

  const waiting = page.locator('#gameroad-rank-match-waiting-surface');
  await expect(waiting).toBeVisible();
  await expect(battle.locator('#battleRuntime')).toBeHidden();
  return { home, setup, battle, waiting };
}

async function attach(page, testInfo, name) {
  await testInfo.attach(name, {
    body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
    contentType: 'image/png',
  });
}

test('Rank Match waiting is a Battle child with Advice partner picker', async ({ page }, testInfo) => {
  const pageErrors = [];
  const consoleErrors = [];
  const httpErrors = [];
  const assetStatuses = new Map();

  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.pathname.includes('/assets/visual/rank-match/')) {
      assetStatuses.set(url.pathname.split('/').pop(), response.status());
    }
    if (response.status() < 400) return;
    if (response.status() === 404 && url.pathname.endsWith('/gameroad-version.json')) return;
    if (response.status() === 404 && url.pathname === '/ws') return;
    httpErrors.push(`${response.status()} ${url.pathname}`);
  });

  const { setup, battle, waiting } = await enterRankWaiting(page);
  await attach(page, testInfo, 'rank-waiting');

  for (const asset of RANK_ASSETS) {
    expect(assetStatuses.get(asset), `generated rank asset ${asset} loaded`).toBe(200);
  }

  const partner = waiting.locator('[data-rank-waiting-partner]');
  await expect(partner).toBeVisible();
  await partner.click();

  const picker = page.locator('#gameroad-rank-partner-picker');
  await expect(picker).toBeVisible();
  const shell = picker.locator('.rankPartnerPickerShell');
  const box = await shell.boundingBox();
  expect(box, 'partner picker shell has layout bounds').not.toBeNull();
  expect(Math.abs(box.width - box.height), 'partner picker shell stays square').toBeLessThan(Math.max(4, Math.min(box.width, box.height) * 0.04));

  const choices = picker.locator('[data-partner-choice]');
  await expect(choices).not.toHaveCount(0);
  await choices.first().click();
  await expect(picker).toBeHidden();
  await expect(partner).toBeFocused();

  await partner.click();
  await expect(picker).toBeVisible();
  await picker.click({ position: { x: 3, y: 3 } });
  await expect(picker).toBeHidden();

  await partner.click();
  await expect(picker).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(picker).toBeHidden();
  await expect(partner).toBeFocused();

  await waiting.locator('[data-rank-waiting-cancel]').first().click();
  await expect(setup).toBeVisible({ timeout: 10_000 });
  await expect(waiting).toBeHidden();
  await expect(battle).toHaveAttribute('data-rank-waiting', 'false');

  expect(httpErrors, `unexpected HTTP errors:
${httpErrors.join('\n')}`).toEqual([]);
  expect(pageErrors, `page errors:
${pageErrors.join('\n')}`).toEqual([]);
  const unexpectedConsoleErrors = consoleErrors.filter((message) =>
    !message.includes('gameroad-version.json') && !message.includes('/ws'),
  );
  expect(unexpectedConsoleErrors, `console errors:
${unexpectedConsoleErrors.join('\n')}`).toEqual([]);
});

test('Rank Match waiting honors reduced motion without losing the flow', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { waiting } = await enterRankWaiting(page);
  const vfxAnimation = await waiting.locator('.rankWaitingVfx').evaluate((node) => getComputedStyle(node).animationName);
  const pulseAnimation = await waiting.locator('.rankWaitingStatus').evaluate((node) => getComputedStyle(node, '::before').animationName);
  expect(vfxAnimation).toBe('none');
  expect(pulseAnimation).toBe('none');
});
