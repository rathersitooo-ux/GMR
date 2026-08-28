import { test, expect } from '@playwright/test';

const FIXED_TIME = new Date('2026-08-28T00:00:00.000Z');
const ROOT_GO = (target) => `[data-go="${target}"]:visible, [data-home-target="${target}"]:visible, [data-root-go="${target}"]:visible`;

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
    snapshot() {
      const remainingConsoleErrors = [...consoleErrors];
      for (let i = 0; i < versionManifest404Count; i += 1) {
        const index = remainingConsoleErrors.findIndex((message) =>
          message.includes('Failed to load resource') && message.includes('404'),
        );
        if (index >= 0) remainingConsoleErrors.splice(index, 1);
      }
      return {
        pageErrors: [...pageErrors],
        consoleErrors: remainingConsoleErrors,
        unexpectedHttpErrors: [...unexpectedHttpErrors],
        knownVersionManifest404Count: versionManifest404Count,
      };
    },
    assertClean(testInfo) {
      const current = this.snapshot();
      if (current.knownVersionManifest404Count > 0) {
        testInfo.annotations.push({
          type: 'known-deployment-gap',
          description: `gameroad-version.json returned 404 ${current.knownVersionManifest404Count} time(s); tracked outside this local Browser quality gate`,
        });
      }
      expect(current.unexpectedHttpErrors, `unexpected HTTP errors:\n${current.unexpectedHttpErrors.join('\n')}`).toEqual([]);
      expect(current.pageErrors, `page errors:\n${current.pageErrors.join('\n')}`).toEqual([]);
      expect(current.consoleErrors, `console errors:\n${current.consoleErrors.join('\n')}`).toEqual([]);
    },
  };
}

async function bootCurrentBrowser(page) {
  const response = await page.goto('/browser/GAMEROAD.html', { waitUntil: 'domcontentloaded' });
  expect(response, 'main HTML response').not.toBeNull();
  expect(response.ok(), `main HTML status ${response.status()}`).toBeTruthy();
  await expect(page.locator('section[data-screen="home"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => Boolean(window.__GAMEROAD_TEST__?.state))).toBeTruthy();
}

async function stateSnapshot(page, label) {
  const snapshot = await page.evaluate((snapshotLabel) => {
    const active = [...document.querySelectorAll('section.screen.active')].filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    });
    const internal = window.__GAMEROAD_TEST__?.state ?? null;
    return {
      label: snapshotLabel,
      now: Date.now(),
      performanceNow: performance.now(),
      visibleActiveCount: active.length,
      visibleScreen: active[0]?.dataset.screen ?? null,
      internalScreen: internal?.screen ?? null,
      activeText: active[0]?.innerText?.slice(0, 240) ?? '',
    };
  }, label);

  expect(snapshot.visibleActiveCount, `${label}: exactly one visible active screen`).toBe(1);
  expect(snapshot.internalScreen, `${label}: internal state exposes current screen`).toBeTruthy();
  expect(snapshot.visibleScreen, `${label}: visible and internal screen must agree`).toBe(snapshot.internalScreen);
  return snapshot;
}

async function attachJson(testInfo, name, payload) {
  await testInfo.attach(name, {
    body: Buffer.from(`${JSON.stringify(payload, null, 2)}\n`, 'utf8'),
    contentType: 'application/json',
  });
}

async function webQualitySnapshot(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const labelText = (element) => {
      const ariaLabel = element.getAttribute('aria-label')?.trim();
      if (ariaLabel) return ariaLabel;
      const labelledBy = element.getAttribute('aria-labelledby');
      if (labelledBy) {
        const text = labelledBy
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
          .filter(Boolean)
          .join(' ');
        if (text) return text;
      }
      if (element.id) {
        const explicit = document.querySelector(`label[for="${CSS.escape(element.id)}"]`)?.textContent?.trim();
        if (explicit) return explicit;
      }
      const wrapped = element.closest('label')?.textContent?.trim();
      if (wrapped) return wrapped;
      const text = element.textContent?.trim();
      if (text) return text;
      return (
        element.getAttribute('title')?.trim()
        || element.getAttribute('alt')?.trim()
        || element.getAttribute('value')?.trim()
        || ''
      );
    };

    const activeScreen = [...document.querySelectorAll('section.screen.active')].find(visible) ?? null;
    const interactiveSelector = 'button, a[href], input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])';
    const interactives = activeScreen ? [...activeScreen.querySelectorAll(interactiveSelector)].filter(visible) : [];
    const unnamed = interactives
      .filter((element) => !labelText(element))
      .slice(0, 30)
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        id: element.id || null,
        className: String(element.className || '').slice(0, 120) || null,
        role: element.getAttribute('role'),
        type: element.getAttribute('type'),
      }));

    const ids = activeScreen
      ? [...activeScreen.querySelectorAll('[id]')].filter(visible).map((element) => element.id).filter(Boolean)
      : [];
    const duplicateVisibleIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    const hiddenFocusable = [...document.querySelectorAll('[aria-hidden="true"] button, [aria-hidden="true"] a[href], [aria-hidden="true"] input, [aria-hidden="true"] select, [aria-hidden="true"] textarea, [aria-hidden="true"] [tabindex]:not([tabindex="-1"])')]
      .filter(visible)
      .slice(0, 30)
      .map((element) => element.id || element.tagName.toLowerCase());

    const nav = performance.getEntriesByType('navigation')[0];
    const resources = performance.getEntriesByType('resource');
    const transferSize = resources.reduce((sum, entry) => sum + (Number(entry.transferSize) || 0), 0);
    const encodedBodySize = resources.reduce((sum, entry) => sum + (Number(entry.encodedBodySize) || 0), 0);
    const viewportMeta = document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? '';

    return {
      document: {
        lang: document.documentElement.lang || '',
        title: document.title || '',
        viewportMeta,
      },
      activeScreen: {
        visible: activeScreen?.dataset.screen ?? null,
        internal: window.__GAMEROAD_TEST__?.state?.screen ?? null,
        interactiveCount: interactives.length,
        unnamedInteractiveCount: unnamed.length,
        unnamedInteractives: unnamed,
        duplicateVisibleIds,
        hiddenFocusable,
      },
      layout: {
        viewportWidth: document.documentElement.clientWidth,
        viewportHeight: document.documentElement.clientHeight,
        documentWidth: document.documentElement.scrollWidth,
        documentHeight: document.documentElement.scrollHeight,
        overflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      },
      performance: {
        navigation: nav ? {
          responseStart: nav.responseStart,
          responseEnd: nav.responseEnd,
          domContentLoadedEventEnd: nav.domContentLoadedEventEnd,
          loadEventEnd: nav.loadEventEnd,
          duration: nav.duration,
        } : null,
        resourceCount: resources.length,
        transferSize,
        encodedBodySize,
      },
    };
  });
}

test('R42 controlled browser time keeps visible and internal screen state aligned', async ({ page }, testInfo) => {
  const runtime = observeRuntimeErrors(page);
  await page.clock.install({ time: FIXED_TIME });
  await bootCurrentBrowser(page);
  await page.clock.pauseAt(FIXED_TIME);

  const timeline = [];
  timeline.push(await stateSnapshot(page, 'home-paused'));

  await page.evaluate(() => {
    document.documentElement.dataset.gameroadTemporalProbe = 'pending';
    setTimeout(() => {
      document.documentElement.dataset.gameroadTemporalProbe = 'done';
    }, 250);
  });
  await page.clock.runFor(249);
  expect(await page.locator('html').getAttribute('data-gameroad-temporal-probe')).toBe('pending');
  timeline.push(await stateSnapshot(page, 'home-plus-249ms'));
  await page.clock.runFor(1);
  expect(await page.locator('html').getAttribute('data-gameroad-temporal-probe')).toBe('done');
  timeline.push(await stateSnapshot(page, 'home-plus-250ms'));

  const cardsControl = page.locator(ROOT_GO('cards')).first();
  await expect(cardsControl, 'Home exposes a visible Cards control').toBeVisible();
  await cardsControl.click();
  timeline.push(await stateSnapshot(page, 'cards-after-input'));
  await page.clock.runFor(16);
  timeline.push(await stateSnapshot(page, 'cards-plus-16ms'));
  await page.clock.runFor(84);
  timeline.push(await stateSnapshot(page, 'cards-plus-100ms'));
  await page.clock.runFor(150);
  timeline.push(await stateSnapshot(page, 'cards-plus-250ms'));

  const cardsPng = await page.screenshot({ fullPage: true });
  await testInfo.attach(`${testInfo.project.name}-r42-temporal-cards.png`, { body: cardsPng, contentType: 'image/png' });
  await attachJson(testInfo, `${testInfo.project.name}-r42-temporal-state.json`, {
    method: 'Playwright controlled browser time + same-moment visible/internal state readback',
    fixedTime: FIXED_TIME.toISOString(),
    timeline,
    nonClaims: ['CSS-animation frame determinism', 'human motion acceptance', 'physical-device feel'],
  });

  runtime.assertClean(testInfo);
});

test('R42 records bounded web-quality evidence without inventing performance budgets', async ({ page }, testInfo) => {
  const runtime = observeRuntimeErrors(page);
  await bootCurrentBrowser(page);

  const home = await webQualitySnapshot(page);
  expect(home.document.lang, 'document language must be declared').toBeTruthy();
  expect(home.document.title.trim(), 'document title must be non-empty').toBeTruthy();
  expect(home.document.viewportMeta, 'mobile viewport metadata must be present').toContain('width=device-width');
  expect(home.activeScreen.visible, 'Home visible/internal state consistency').toBe(home.activeScreen.internal);
  expect(home.activeScreen.duplicateVisibleIds, 'visible active screen should not expose duplicate IDs').toEqual([]);
  expect(home.activeScreen.hiddenFocusable, 'aria-hidden content must not contain visible focusable controls').toEqual([]);
  expect(home.performance.navigation, 'navigation timing entry must exist').not.toBeNull();
  expect(home.performance.navigation.responseEnd).toBeGreaterThanOrEqual(home.performance.navigation.responseStart);
  expect(home.performance.navigation.domContentLoadedEventEnd).toBeGreaterThanOrEqual(home.performance.navigation.responseEnd);

  const cardsControl = page.locator(ROOT_GO('cards')).first();
  await expect(cardsControl).toBeVisible();
  await cardsControl.click();
  await expect(page.locator('section[data-screen="cards"]')).toBeVisible();
  const cards = await webQualitySnapshot(page);
  expect(cards.activeScreen.visible, 'Cards visible/internal state consistency').toBe(cards.activeScreen.internal);
  expect(cards.activeScreen.duplicateVisibleIds, 'Cards visible active screen should not expose duplicate IDs').toEqual([]);
  expect(cards.activeScreen.hiddenFocusable, 'Cards aria-hidden content must not contain visible focusable controls').toEqual([]);

  const unnamed = home.activeScreen.unnamedInteractiveCount + cards.activeScreen.unnamedInteractiveCount;
  if (unnamed > 0) {
    testInfo.annotations.push({
      type: 'accessibility-debt-evidence',
      description: `${unnamed} visible interactive control(s) lack a discoverable accessible-name proxy across sampled Home/Cards surfaces; recorded as evidence, not an invented release threshold`,
    });
  }
  if (home.layout.overflowX > 0 || cards.layout.overflowX > 0) {
    testInfo.annotations.push({
      type: 'layout-overflow-evidence',
      description: `sampled horizontal overflow px: home=${home.layout.overflowX}, cards=${cards.layout.overflowX}`,
    });
  }

  await attachJson(testInfo, `${testInfo.project.name}-r42-web-quality.json`, {
    method: 'bounded DOM/accessibility/layout/resource/navigation evidence on current Browser build',
    home,
    cards,
    runtime: runtime.snapshot(),
    nonClaims: ['Lighthouse score', 'WCAG conformance', 'human visual acceptance', 'physical-device acceptance'],
  });

  runtime.assertClean(testInfo);
});
