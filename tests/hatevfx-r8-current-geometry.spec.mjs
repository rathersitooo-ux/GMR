import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const TARGET = '/browser/GAMEROAD.html';
const OUT = 'test-results/hatevfx-r8';

function observeRuntime(page) {
  const pageErrors = [];
  const consoleErrors = [];
  const httpErrors = [];
  let knownManifest404 = 0;

  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() < 400) return;
    const url = new URL(response.url());
    if (response.status() === 404 && url.pathname.endsWith('/browser/gameroad-version.json')) {
      knownManifest404 += 1;
      return;
    }
    httpErrors.push(`${response.status()} ${url.pathname}`);
  });

  return {
    snapshot() {
      const filteredConsole = [...consoleErrors];
      for (let i = 0; i < knownManifest404; i += 1) {
        const index = filteredConsole.findIndex((entry) => entry.includes('Failed to load resource') && entry.includes('404'));
        if (index >= 0) filteredConsole.splice(index, 1);
      }
      return { pageErrors, consoleErrors: filteredConsole, httpErrors, knownManifest404 };
    },
  };
}

async function boot(page) {
  const response = await page.goto(TARGET, { waitUntil: 'domcontentloaded' });
  expect(response).not.toBeNull();
  expect(response.ok(), `HTML status ${response.status()}`).toBeTruthy();
  await page.waitForTimeout(900);
  await expect(page.locator('section[data-screen="home"]')).toBeVisible();
}

function visibleHomeControl(page, target) {
  return page.locator(`[data-go="${target}"]:visible, [data-home-target="${target}"]:visible`).first();
}

async function numberText(locator) {
  return Number.parseInt((await locator.textContent()) ?? '', 10);
}

async function prepareLegalDeckThroughVisibleUi(page) {
  const cardsControl = visibleHomeControl(page, 'cards');
  await expect(cardsControl).toBeVisible();
  await cardsControl.click();
  const cards = page.locator('section[data-screen="cards"]');
  await expect(cards).toBeVisible();

  const deckCount = cards.locator('#deckCount');
  let count = await numberText(deckCount);
  expect(Number.isFinite(count), 'main deck count is numeric').toBeTruthy();

  if (count < 40) {
    const candidateIds = await cards
      .locator('#collectionGrid button.slot.live.cardFace:not(.inDeck)[data-id]')
      .evaluateAll((nodes) => [...new Set(nodes.map((node) => node.getAttribute('data-id')).filter(Boolean))]);

    for (const cardId of candidateIds) {
      if (count >= 40) break;
      const candidate = cards.locator(`#collectionGrid button.slot.live.cardFace:not(.inDeck)[data-id="${cardId}"]:visible`).first();
      if ((await candidate.count()) === 0) continue;
      await candidate.click();
      const add = cards.locator('#addSelectedCard');
      if ((await add.count()) === 0 || !(await add.isEnabled())) continue;
      await add.click();
      await page.waitForTimeout(70);
      count = await numberText(deckCount);
      const close = cards.locator('#r4PreviewClose:visible');
      if ((await close.count()) > 0) await close.click();
    }
  }

  await expect(deckCount, 'visible UI can reach legal 40-card main deck').toHaveText('40');

  const mobileTray = cards.locator('#r4DeckTrayToggle:visible');
  if ((await mobileTray.count()) > 0) {
    await mobileTray.click();
    await page.waitForTimeout(80);
  }

  const save = cards.locator('#saveDeck');
  await expect(save).toBeVisible();
  await expect(save).toBeEnabled();
  await save.click();
  await expect(cards.locator('#deckSaveState')).toHaveText('保存済み');
}

async function enterBattleThroughVisibleUi(page) {
  await page.goto(TARGET, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  await expect(page.locator('section[data-screen="home"]')).toBeVisible();

  const setupControl = visibleHomeControl(page, 'setup');
  await expect(setupControl).toBeVisible();
  await setupControl.click();

  const setup = page.locator('section[data-screen="setup"]');
  await expect(setup).toBeVisible();
  await setup.locator('[data-content="road_shield"]').click();
  await setup.locator('[data-mode="2p"]').click();
  const start = setup.locator('#startMatch');
  await expect(start).toBeVisible();
  await expect(start).toBeEnabled();
  await start.click();

  const battle = page.locator('section[data-screen="battle"]');
  await expect(battle).toBeVisible();
  await expect(battle.locator('#hateDial')).toBeVisible();
  await page.waitForTimeout(450);
  return battle;
}

async function measureGeometry(page) {
  return page.evaluate(() => {
    const dial = document.querySelector('#hateDial');
    const partner = document.querySelector('#battleAdvicePartnerStage');
    if (!(dial instanceof HTMLElement)) throw new Error('#hateDial missing');
    if (!(partner instanceof HTMLElement)) throw new Error('#battleAdvicePartnerStage missing');

    const viewport = { width: innerWidth, height: innerHeight };
    const rect = (r) => ({ x: r.x, y: r.y, left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height });
    const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    const visible = (el) => {
      if (!(el instanceof HTMLElement)) return false;
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) !== 0 && r.width > 1 && r.height > 1;
    };

    const d = dial.getBoundingClientRect();
    const p = partner.getBoundingClientRect();
    const actions = [...document.querySelectorAll('button, input, select, textarea, a[href], [role="button"], [tabindex]')]
      .filter(visible)
      .filter((el) => el !== dial && !dial.contains(el) && !el.contains(dial))
      .map((el) => ({ tag: el.tagName, id: el.id || '', cls: String(el.className || '').slice(0, 160), rect: rect(el.getBoundingClientRect()) }));

    const pads = [0, 2, 4, 6, 8, 10, 12, 16, 20];
    const candidates = pads.map((pad) => {
      const expanded = { left: d.left - pad, top: d.top - pad, right: d.right + pad, bottom: d.bottom + pad };
      expanded.width = expanded.right - expanded.left;
      expanded.height = expanded.bottom - expanded.top;
      const insideViewport = expanded.left >= 0 && expanded.top >= 0 && expanded.right <= viewport.width && expanded.bottom <= viewport.height;
      const partnerOverlap = overlap(expanded, p);
      const actionCollisions = actions
        .map((item) => ({ ...item, overlapArea: overlap(expanded, item.rect) }))
        .filter((item) => item.overlapArea > 0.5);
      return { pad, insideViewport, partnerOverlap, actionCollisions };
    });

    const safe = candidates.filter((candidate) => candidate.pad > 0 && candidate.insideViewport && candidate.partnerOverlap <= 0.5 && candidate.actionCollisions.length === 0).at(-1) ?? null;
    const dialStyle = getComputedStyle(dial);
    const partnerStyle = getComputedStyle(partner);
    const docOverflow = {
      x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    };

    return {
      viewport,
      dial: rect(d),
      partner: rect(p),
      partnerVisible: visible(partner),
      dialStyle: {
        position: dialStyle.position,
        zIndex: dialStyle.zIndex,
        pointerEvents: dialStyle.pointerEvents,
        animationName: dialStyle.animationName,
        animationDuration: dialStyle.animationDuration,
      },
      partnerStyle: {
        position: partnerStyle.position,
        zIndex: partnerStyle.zIndex,
        pointerEvents: partnerStyle.pointerEvents,
      },
      basePartnerOverlap: overlap(d, p),
      candidates,
      safePadding: safe?.pad ?? null,
      geometryStatus: safe ? 'SAFE_ENVELOPE_FOUND' : 'NO_SAFE_ENVELOPE',
      docOverflow,
    };
  });
}

async function reducedMotionSnapshot(page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(80);
  const result = await page.evaluate(() => {
    const dial = document.querySelector('#hateDial');
    const partner = document.querySelector('#battleAdvicePartnerStage');
    if (!(dial instanceof HTMLElement) || !(partner instanceof HTMLElement)) return null;
    const d = dial.getBoundingClientRect();
    const p = partner.getBoundingClientRect();
    const ds = getComputedStyle(dial);
    const ps = getComputedStyle(partner);
    return {
      dial: { left: d.left, top: d.top, right: d.right, bottom: d.bottom, width: d.width, height: d.height },
      partner: { left: p.left, top: p.top, right: p.right, bottom: p.bottom, width: p.width, height: p.height },
      dialAnimationName: ds.animationName,
      dialAnimationDuration: ds.animationDuration,
      partnerVisibility: ps.visibility,
      partnerDisplay: ps.display,
    };
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  return result;
}

async function proveNegativeHitTest(page) {
  return page.evaluate(() => {
    const target = [...document.querySelectorAll('button, [role="button"], input, select')]
      .find((el) => {
        if (!(el instanceof HTMLElement)) return false;
        const r = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return r.width > 8 && r.height > 8 && style.display !== 'none' && style.visibility !== 'hidden';
      });
    if (!(target instanceof HTMLElement)) return { detected: false, reason: 'no visible actionable target' };
    const r = target.getBoundingClientRect();
    const probe = document.createElement('div');
    probe.id = 'hatevfx-r8-negative-hit-probe';
    Object.assign(probe.style, {
      position: 'fixed',
      left: `${r.left}px`,
      top: `${r.top}px`,
      width: `${Math.max(8, Math.min(24, r.width))}px`,
      height: `${Math.max(8, Math.min(24, r.height))}px`,
      pointerEvents: 'auto',
      zIndex: '2147483647',
      background: 'rgba(255,0,0,.01)',
    });
    document.body.appendChild(probe);
    const pr = probe.getBoundingClientRect();
    const hit = document.elementFromPoint(pr.left + pr.width / 2, pr.top + pr.height / 2);
    const detected = hit === probe;
    probe.remove();
    return { detected, target: { tag: target.tagName, id: target.id || '', cls: String(target.className || '').slice(0, 120) } };
  });
}

test('measures exact-current HATE and advice-partner separation', async ({ page }, testInfo) => {
  const runtime = observeRuntime(page);
  await boot(page);
  await prepareLegalDeckThroughVisibleUi(page);
  await enterBattleThroughVisibleUi(page);

  const geometry = await measureGeometry(page);
  expect(geometry.dial.width, '#hateDial has width').toBeGreaterThan(1);
  expect(geometry.dial.height, '#hateDial has height').toBeGreaterThan(1);
  expect(geometry.partnerVisible, 'advice partner stage remains visible').toBeTruthy();

  const reducedMotion = await reducedMotionSnapshot(page);
  expect(reducedMotion, 'reduced-motion snapshot exists').not.toBeNull();

  const negative = await proveNegativeHitTest(page);
  expect(negative.detected, `negative hit-test control: ${JSON.stringify(negative)}`).toBeTruthy();

  const runtimeResult = runtime.snapshot();
  expect(runtimeResult.pageErrors, `page errors: ${runtimeResult.pageErrors.join('\n')}`).toEqual([]);
  expect(runtimeResult.httpErrors, `HTTP errors: ${runtimeResult.httpErrors.join('\n')}`).toEqual([]);
  expect(runtimeResult.consoleErrors, `console errors: ${runtimeResult.consoleErrors.join('\n')}`).toEqual([]);

  const evidence = {
    project: testInfo.project.name,
    head: process.env.GITHUB_SHA ?? null,
    expectedHtmlBlob: process.env.EXPECTED_HTML_BLOB ?? null,
    geometry,
    reducedMotion,
    negativeHitTest: negative,
    runtime: runtimeResult,
  };

  await fs.mkdir(OUT, { recursive: true });
  await fs.writeFile(path.join(OUT, `${testInfo.project.name}.json`), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(`HATEVFX_R8_GEOMETRY ${JSON.stringify({ project: testInfo.project.name, basePartnerOverlap: geometry.basePartnerOverlap, safePadding: geometry.safePadding, geometryStatus: geometry.geometryStatus, dial: geometry.dial, partner: geometry.partner, docOverflow: geometry.docOverflow })}`);
  const screenshot = await page.screenshot({ fullPage: true, animations: 'disabled' });
  await testInfo.attach(`${testInfo.project.name}-hatevfx-r8.png`, { body: screenshot, contentType: 'image/png' });
});
