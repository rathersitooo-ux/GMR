import { test, expect } from '@playwright/test';
import {
  SCREEN_TRANSITION_EVENT,
  SCREEN_TRANSITION_MODE,
  beginScreenTransition,
  createScreenTransitionState,
  advanceScreenTransition,
  resolveScreenTransitionMotionProfile,
} from '../browser/screen-transition-core.mjs';

test('transition core keeps state authority separate from motion projection', async () => {
  const normal = resolveScreenTransitionMotionProfile(SCREEN_TRANSITION_MODE.NORMAL, 'important');
  const reduced = resolveScreenTransitionMotionProfile(SCREEN_TRANSITION_MODE.REDUCED, 'important');
  expect(normal.movement).toBe('short-axis');
  expect(reduced.movement).toBe('none');
  expect(reduced.opacity).toBe('crossfade');

  const started = beginScreenTransition(createScreenTransitionState('home'), { to: 'setup', importance: 'important' });
  expect(started.accepted).toBeTruthy();
  const generation = started.generation;
  const prepared = advanceScreenTransition(started.state, generation, SCREEN_TRANSITION_EVENT.PREPARED);
  const swapped = advanceScreenTransition(prepared.state, generation, SCREEN_TRANSITION_EVENT.SWAPPED);
  expect(swapped.state.visibleScreen).toBe('setup');
  expect(swapped.state.currentScreen).toBe('home');
  const entered = advanceScreenTransition(swapped.state, generation, SCREEN_TRANSITION_EVENT.ENTERED);
  const settled = advanceScreenTransition(entered.state, generation, SCREEN_TRANSITION_EVENT.SETTLED);
  expect(settled.completed).toBeTruthy();
  expect(settled.state.currentScreen).toBe('setup');
});

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
      activeTarget: document.activeElement?.dataset?.homeTarget ?? null,
    }), label));
  };
  const setPad = async (patch) => page.evaluate((next) => Object.assign(globalThis.__GAMEROAD_QA_PAD__, next), patch);
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
    const center = document.getElementById('homePadCenter');
    if (!center) throw new Error('Home motion center missing');
    globalThis.__GAMEROAD_QA_B_MUTATIONS__ = 0;
    new MutationObserver((records) => {
      for (const record of records) {
        if (record.attributeName === 'aria-expanded') globalThis.__GAMEROAD_QA_B_MUTATIONS__ += 1;
      }
    }).observe(center, { attributes: true, attributeFilter: ['aria-expanded'] });
  });

  await setPad({ b: true });
  await page.waitForTimeout(720);
  await snap('B-held');
  const bEvidence = await page.evaluate(() => ({
    mutations: globalThis.__GAMEROAD_QA_B_MUTATIONS__,
    expanded: document.getElementById('homePadCenter')?.getAttribute('aria-expanded'),
    screen: window.GAMEROAD_NAV_QA.snapshot().screen,
  }));
  expect(bEvidence.screen).toBe('home');
  expect(bEvidence.mutations).toBe(1);
  expect(bEvidence.expanded).toBe('false');

  await setPad({ b: false });
  console.log(`GAMEROAD_HOME_GAMEPAD_TEMPORAL ${JSON.stringify({ trace, bEvidence })}`);
  test.info().annotations.push({
    type: 'home-gamepad-temporal',
    description: JSON.stringify({ trace, bEvidence }),
  });
});
