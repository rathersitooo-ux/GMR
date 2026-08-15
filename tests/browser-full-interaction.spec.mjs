import { test, expect } from '@playwright/test';

const CORE_SCREENS = ['home', 'cards', 'characters', 'setup', 'battle', 'result', 'shop'];
const NAV_TARGETS = ['cards', 'characters', 'setup', 'battle', 'shop'];

function observeRuntimeErrors(page) {
  const pageErrors = [];
  const consoleErrors = [];
  const unexpectedHttpErrors = [];
  let versionManifest404Count = 0;

  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() < 400) return;
    const url = new URL(response.url());
    if (response.status() === 404 && url.pathname.endsWith('/browser/gameroad-version.json')) {
      versionManifest404Count += 1;
      return;
    }
    unexpectedHttpErrors.push(`${response.status()} ${url.pathname}`);
  });

  return {
    assertClean(testInfo) {
      const remainingConsoleErrors = [...consoleErrors];
      for (let i = 0; i < versionManifest404Count; i += 1) {
        const index = remainingConsoleErrors.findIndex((message) =>
          message.includes('Failed to load resource') && message.includes('404'),
        );
        if (index >= 0) remainingConsoleErrors.splice(index, 1);
      }
      if (versionManifest404Count > 0) {
        testInfo.annotations.push({
          type: 'known-deployment-gap',
          description: `gameroad-version.json returned 404 ${versionManifest404Count} time(s); tracked separately from interaction evidence`,
        });
      }

      expect(unexpectedHttpErrors, `unexpected HTTP errors:\n${unexpectedHttpErrors.join('\n')}`).toEqual([]);
      expect(pageErrors, `page errors:\n${pageErrors.join('\n')}`).toEqual([]);
      expect(remainingConsoleErrors, `console errors:\n${remainingConsoleErrors.join('\n')}`).toEqual([]);
    },
  };
}

async function attachStateScreenshot(page, testInfo, stateName) {
  const png = await page.screenshot({ fullPage: true, animations: 'disabled' });
  await testInfo.attach(`${testInfo.project.name}-${stateName}.png`, {
    body: png,
    contentType: 'image/png',
  });
}

async function bootCurrentBrowser(page) {
  const response = await page.goto('/browser/GAMEROAD.html', { waitUntil: 'domcontentloaded' });
  expect(response, 'main HTML response').not.toBeNull();
  expect(response.ok(), `main HTML status ${response.status()}`).toBeTruthy();
  await page.waitForTimeout(1_000);

  const doctype = await page.evaluate(() => document.doctype?.name?.toLowerCase() ?? '');
  expect(doctype).toBe('html');

  for (const screen of CORE_SCREENS) {
    const count = await page.locator(`section[data-screen="${screen}"]`).count();
    expect(count, `core screen ${screen}`).toBeGreaterThan(0);
  }

  await expect(page.locator('section[data-screen="home"]')).toBeVisible();
}

function visibleHomeControl(page, target) {
  return page
    .locator(`[data-go="${target}"]:visible, [data-home-target="${target}"]:visible`)
    .first();
}

test('captures success-state screenshots for current pointer navigation', async ({ page }, testInfo) => {
  const runtime = observeRuntimeErrors(page);
  await bootCurrentBrowser(page);
  await attachStateScreenshot(page, testInfo, 'home');

  let pointerTransitions = 0;
  const unreachableTargets = [];

  for (const target of NAV_TARGETS) {
    await page.goto('/browser/GAMEROAD.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    const control = visibleHomeControl(page, target);
    if ((await control.count()) === 0) {
      unreachableTargets.push(target);
      continue;
    }

    await control.click({ timeout: 5_000 });
    pointerTransitions += 1;
    const targetSection = page.locator(`section[data-screen="${target}"]`);
    await expect(targetSection, `pointer navigation target ${target}`).toBeVisible();
    await page.waitForTimeout(120);
    await attachStateScreenshot(page, testInfo, target);
  }

  if (unreachableTargets.length > 0) {
    testInfo.annotations.push({
      type: 'not-yet-covered',
      description: `No visible root control for: ${unreachableTargets.join(', ')}. This R1 evidence does not claim full interaction coverage.`,
    });
  }

  expect(pointerTransitions, 'at least one real visible Home pointer transition').toBeGreaterThan(0);
  runtime.assertClean(testInfo);
});

async function elementInventory(locator) {
  return locator.evaluateAll((nodes) => nodes.map((node) => ({
    tag: node.tagName.toLowerCase(),
    id: node.id || null,
    text: (node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160),
    className: typeof node.className === 'string' ? node.className : null,
    hidden: node.hidden,
    disabled: 'disabled' in node ? Boolean(node.disabled) : false,
    ariaLabel: node.getAttribute('aria-label'),
    data: Object.fromEntries([...node.attributes]
      .filter((attribute) => attribute.name.startsWith('data-'))
      .map((attribute) => [attribute.name, attribute.value])),
    visible: Boolean(node.getClientRects().length) && getComputedStyle(node).visibility !== 'hidden',
  })));
}

test('R2 diagnostic: inventories current Cards, Battle and Result contracts without mutating game bytes', async ({ page }, testInfo) => {
  const runtime = observeRuntimeErrors(page);
  await bootCurrentBrowser(page);

  const cardsControl = visibleHomeControl(page, 'cards');
  await expect(cardsControl).toBeVisible();
  await cardsControl.click();
  const cards = page.locator('section[data-screen="cards"]');
  await expect(cards).toBeVisible();
  await page.waitForTimeout(300);

  const inventory = {
    cards: {
      buttons: await elementInventory(cards.locator('button')),
      collectionChildren: await elementInventory(cards.locator('#collectionGrid > *')),
      deckSlots: await elementInventory(cards.locator('#deckSlots > *')),
      exDeckSlots: await elementInventory(cards.locator('#exDeckSlots > *')),
      saveDeck: await elementInventory(cards.locator('#saveDeck')),
      trayToggle: await elementInventory(cards.locator('#r4DeckTrayToggle')),
      text: await cards.locator('body').count().catch(() => 0),
      deckCount: await cards.locator('#deckCount').textContent(),
      exDeckCount: await cards.locator('#exDeckCount').textContent(),
      trayCount: await cards.locator('#r4TrayCount').textContent(),
      saveState: await cards.locator('#deckSaveState').textContent(),
    },
    battleHiddenContract: {
      buttons: await elementInventory(page.locator('section[data-screen="battle"] button')),
      selects: await elementInventory(page.locator('section[data-screen="battle"] select')),
    },
    resultHiddenContract: {
      buttons: await elementInventory(page.locator('section[data-screen="result"] button')),
    },
    storageKeys: await page.evaluate(() => Object.keys(localStorage).sort()),
  };

  await testInfo.attach(`${testInfo.project.name}-r2-current-contract-inventory.json`, {
    body: Buffer.from(JSON.stringify(inventory, null, 2)),
    contentType: 'application/json',
  });
  await attachStateScreenshot(page, testInfo, 'r2-cards-inventory');
  runtime.assertClean(testInfo);
});
