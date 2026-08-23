import { test, expect } from '@playwright/test';

test('Home gamepad confirm and cancel are edge-triggered under held input', async ({ page }) => {
  await page.addInitScript(() => {
    const qaPad = { a: false, b: false, axes: [0, 0] };
    Object.defineProperty(globalThis, '__GAMEROAD_QA_PAD__', {
      configurable: false,
      enumerable: false,
      writable: false,
      value: qaPad,
    });
    const button = (pressed) => ({ pressed, touched: pressed, value: pressed ? 1 : 0 });
    Object.defineProperty(Navigator.prototype, 'getGamepads', {
      configurable: true,
      value() {
        const s = globalThis.__GAMEROAD_QA_PAD__;
        return [{
          connected: true,
          index: 0,
          id: 'GAMEROAD QA STANDARD GAMEPAD',
          mapping: 'standard',
          timestamp: performance.now(),
          axes: [...s.axes],
          buttons: [button(s.a), button(s.b)],
        }];
      },
    });
  });

  const response = await page.goto('/browser/GAMEROAD.html', { waitUntil: 'domcontentloaded' });
  expect(response, 'main HTML response').not.toBeNull();
  expect(response.ok(), `main HTML status ${response.status()}`).toBeTruthy();
  await page.waitForLoadState('load');
  await page.waitForTimeout(300);

  const trace = [];
  const snap = async (label) => {
    trace.push(await page.evaluate((entryLabel) => ({
      label: entryLabel,
      t: Number(performance.now().toFixed(1)),
      nav: window.GAMEROAD_NAV_QA?.snapshot?.() ?? null,
      motion: window.GAMEROAD_HOME_MOTION_QA?.snapshot?.() ?? null,
      expanded: document.getElementById('homePadCenter')?.getAttribute('aria-expanded') ?? null,
      activeTarget: document.activeElement?.dataset?.homeTarget ?? null,
    }), label));
  };
  const setPad = async (patch) => page.evaluate((next) => Object.assign(globalThis.__GAMEROAD_QA_PAD__, next), patch);
  const expanded = async () => page.evaluate(() => document.getElementById('homePadCenter')?.getAttribute('aria-expanded'));
  const focusSetup = async () => page.evaluate(() => {
    window.GAMEROAD_NAV_QA.root('home');
    window.GAMEROAD_HOME_MOTION_QA.expand();
    const target = document.querySelector('.homePadChoice[data-home-target="setup"]');
    if (!target) throw new Error('Home setup motion target missing');
    target.focus();
  });

  await setPad({ a: false, b: false, axes: [0, 0] });
  await page.waitForTimeout(80);
  await focusSetup();
  await snap('home-focused-before-A');

  await setPad({ a: true });
  await page.waitForTimeout(360);
  await snap('after-A-edge');
  expect(await page.evaluate(() => window.GAMEROAD_NAV_QA.snapshot().screen)).toBe('setup');

  await page.evaluate(() => {
    window.GAMEROAD_NAV_QA.root('home');
    window.GAMEROAD_HOME_MOTION_QA.expand();
    document.querySelector('.homePadChoice[data-home-target="setup"]')?.focus();
  });
  await page.waitForTimeout(620);
  await snap('A-held-after-return-home');
  expect(await page.evaluate(() => window.GAMEROAD_NAV_QA.snapshot().screen)).toBe('home');

  await setPad({ a: false });
  await page.waitForTimeout(80);
  await setPad({ a: true });
  await page.waitForTimeout(360);
  await snap('A-repress');
  expect(await page.evaluate(() => window.GAMEROAD_NAV_QA.snapshot().screen)).toBe('setup');

  await setPad({ a: false, b: false });
  await page.waitForTimeout(80);
  await page.evaluate(() => {
    window.GAMEROAD_NAV_QA.root('home');
    window.GAMEROAD_HOME_MOTION_QA.expand();
  });
  await page.waitForTimeout(120);
  await snap('B-before-edge');
  expect(await expanded()).toBe('true');

  await setPad({ b: true });
  await page.waitForTimeout(360);
  await snap('B-after-edge');
  expect(await page.evaluate(() => window.GAMEROAD_NAV_QA.snapshot().screen)).toBe('home');
  expect(await expanded()).toBe('false');

  await page.waitForTimeout(620);
  await snap('B-held');
  expect(await expanded()).toBe('false');

  await setPad({ b: false });
  await page.waitForTimeout(80);
  await setPad({ b: true });
  await page.waitForTimeout(360);
  await snap('B-repress');
  expect(await expanded()).toBe('true');

  await setPad({ b: false });
  const bEvidence = {
    before: trace.find((x) => x.label === 'B-before-edge')?.expanded,
    afterEdge: trace.find((x) => x.label === 'B-after-edge')?.expanded,
    held: trace.find((x) => x.label === 'B-held')?.expanded,
    repress: trace.find((x) => x.label === 'B-repress')?.expanded,
  };
  console.log(`GAMEROAD_HOME_GAMEPAD_TEMPORAL ${JSON.stringify({ trace, bEvidence })}`);
  test.info().annotations.push({
    type: 'home-gamepad-temporal',
    description: JSON.stringify({ trace, bEvidence }),
  });
});
