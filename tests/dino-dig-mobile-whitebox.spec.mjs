import { test, expect } from '@playwright/test';

const WHITEBOX_URL = '/browser/dino-dig-mobile-whitebox.html';

function observeRuntimeErrors(page) {
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  return {
    assertClean() {
      expect(pageErrors, `page errors: ${pageErrors.join('\n')}`).toEqual([]);
      expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toEqual([]);
    },
  };
}

async function snapshot(page) {
  return page.evaluate(() => window.__DINO_DIG_WHITEBOX__.snapshot());
}

test('three presentations share one excavation state and rendering fallbacks do not change rules', async ({ page }) => {
  const runtime = observeRuntimeErrors(page);
  await page.goto(WHITEBOX_URL, { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: '発掘操作 whitebox R2' })).toBeVisible();
  await expect(page.locator('button[data-mode]')).toHaveCount(3);
  await expect(page.locator('#digCanvas')).toBeVisible();

  const initial = await snapshot(page);
  expect(initial.inputCount).toBe(0);
  expect(initial.damageEvents).toBe(0);
  expect(initial.removed).toBe(0);
  expect(initial.completed).toBe(false);
  expect(initial.fossilCells).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'hybrid depth' }).click();
  const hybrid = await snapshot(page);
  expect(hybrid.mode).toBe('hybrid');
  expect(hybrid.stateHash).toBe(initial.stateHash);
  expect(hybrid.inputCount).toBe(initial.inputCount);

  await page.getByRole('button', { name: 'limited deformable' }).click();
  const deform = await snapshot(page);
  expect(deform.mode).toBe('deform');
  expect(deform.stateHash).toBe(initial.stateHash);
  expect(deform.inputCount).toBe(initial.inputCount);

  await page.locator('#lowPerf').check();
  const lowPerf = await snapshot(page);
  expect(lowPerf.lowPerf).toBe(true);
  expect(lowPerf.stateHash).toBe(initial.stateHash);

  await page.locator('#reducedMotion').check();
  const reducedMotion = await snapshot(page);
  expect(reducedMotion.reducedMotion).toBe(true);
  expect(reducedMotion.stateHash).toBe(initial.stateHash);

  await expect(page.locator('#frameMs')).toContainText('ms');
  runtime.assertClean();
});

test('pointer/touch-equivalent input mutates the shared state and reset restores the deterministic fixture', async ({ page }) => {
  const runtime = observeRuntimeErrors(page);
  await page.goto(WHITEBOX_URL, { waitUntil: 'domcontentloaded' });

  const initial = await snapshot(page);
  const canvas = page.locator('#digCanvas');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();

  const clientX = box.x + box.width * 0.15;
  const clientY = box.y + box.height * 0.15;
  await canvas.dispatchEvent('pointerdown', {
    pointerId: 17,
    pointerType: 'touch',
    isPrimary: true,
    buttons: 1,
    clientX,
    clientY,
  });
  await canvas.dispatchEvent('pointerup', {
    pointerId: 17,
    pointerType: 'touch',
    isPrimary: true,
    buttons: 0,
    clientX,
    clientY,
  });

  const afterTouch = await snapshot(page);
  expect(afterTouch.inputCount).toBe(1);
  expect(afterTouch.stateHash).not.toBe(initial.stateHash);
  await expect(page.locator('#inputCount')).toHaveText('1');

  // Same abstract dig mutation must remain valid after switching presentation.
  await page.getByRole('button', { name: '2D mask' }).click();
  const beforeApiDig = await snapshot(page);
  const changed = await page.evaluate(() => window.__DINO_DIG_WHITEBOX__.digCell(10, 10));
  expect(changed).toBe(true);
  const afterApiDig = await snapshot(page);
  expect(afterApiDig.inputCount).toBe(beforeApiDig.inputCount + 1);
  expect(afterApiDig.stateHash).not.toBe(beforeApiDig.stateHash);

  await page.getByRole('button', { name: '同一fixtureへリセット' }).click();
  const reset = await snapshot(page);
  expect(reset.inputCount).toBe(0);
  expect(reset.damageEvents).toBe(0);
  expect(reset.removed).toBe(0);
  expect(reset.completed).toBe(false);
  expect(reset.stateHash).toBe(initial.stateHash);

  runtime.assertClean();
});

test('all three modes can expose the same cell without changing the success contract', async ({ page }) => {
  const runtime = observeRuntimeErrors(page);
  await page.goto(WHITEBOX_URL, { waitUntil: 'domcontentloaded' });

  const hashes = [];
  for (const modeName of ['2D mask', 'hybrid depth', 'limited deformable']) {
    await page.getByRole('button', { name: modeName }).click();
    await page.evaluate(() => {
      window.__DINO_DIG_WHITEBOX__.reset();
      for (let i = 0; i < 5; i++) window.__DINO_DIG_WHITEBOX__.digCell(10, 10);
    });
    const state = await snapshot(page);
    expect(state.inputCount).toBeGreaterThan(0);
    expect(state.removed).toBe(1);
    expect(state.completed).toBe(false);
    hashes.push(state.stateHash);
  }

  expect(new Set(hashes).size, 'presentation mode must not alter the shared dig mutation').toBe(1);
  runtime.assertClean();
});
