import { test, expect } from '@playwright/test';

const STORAGE_KEY = 'gameroad.browser.v10.core.1';
const CANDIDATE_MARKER = 'data-r15-art-candidate';

function candidateDataUrl() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 840">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#111827"/>
          <stop offset="0.5" stop-color="#2563eb"/>
          <stop offset="1" stop-color="#7c3aed"/>
        </linearGradient>
        <pattern id="p" width="48" height="48" patternUnits="userSpaceOnUse">
          <path d="M0 48L48 0M-12 12L12-12M36 60L60 36" stroke="#ffffff" stroke-opacity="0.18" stroke-width="8"/>
        </pattern>
      </defs>
      <rect width="600" height="840" rx="42" fill="url(#g)"/>
      <rect width="600" height="840" rx="42" fill="url(#p)"/>
      <circle cx="300" cy="330" r="150" fill="none" stroke="#ffffff" stroke-width="22" stroke-opacity="0.85"/>
      <path d="M300 170L355 305L500 330L390 425L420 575L300 505L180 575L210 425L100 330L245 305Z" fill="#ffffff" fill-opacity="0.8"/>
      <text x="300" y="690" text-anchor="middle" fill="#ffffff" font-family="sans-serif" font-size="62" font-weight="700">R15</text>
      <text x="300" y="752" text-anchor="middle" fill="#ffffff" font-family="sans-serif" font-size="32">CANDIDATE ART</text>
    </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function attachScreenshot(page, testInfo, name) {
  const png = await page.screenshot({ fullPage: true, animations: 'disabled' });
  await testInfo.attach(`${testInfo.project.name}-${name}.png`, {
    body: png,
    contentType: 'image/png',
  });
}

async function bootCurrentBrowser(page) {
  const response = await page.goto('/browser/GAMEROAD.html?testmode=1&testseed=IMAGEPIPE-R15', {
    waitUntil: 'domcontentloaded',
  });
  expect(response, 'main HTML response').not.toBeNull();
  expect(response.ok(), `main HTML status ${response.status()}`).toBeTruthy();
  await page.waitForTimeout(800);
  await expect(page.locator('section[data-screen="home"]')).toBeVisible();
}

async function enterCardsFromHome(page) {
  const cardsControl = page
    .locator('[data-go="cards"]:visible, [data-home-target="cards"]:visible')
    .first();
  await expect(cardsControl).toBeVisible();
  await cardsControl.click();
  const cards = page.locator('section[data-screen="cards"]');
  await expect(cards).toBeVisible();
  await page.waitForTimeout(250);
  return cards;
}

test('preformal art candidate is practiced in the actual Cards use-site without persisting it', async ({ page }, testInfo) => {
  await bootCurrentBrowser(page);
  let cards = await enterCardsFromHome(page);
  const target = cards.locator('#collectionGrid button.slot.live.cardFace[data-id]:visible').first();
  await expect(target, 'actual current Cards use-site contains a visible card').toBeVisible();
  const targetCardId = await target.getAttribute('data-id');
  expect(targetCardId, 'candidate injection target has canonical card id').toBeTruthy();

  await attachScreenshot(page, testInfo, 'art-practice-baseline-cards');
  const storedImmediatelyBeforeInjection = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);

  const injected = await target.evaluate((node, payload) => {
    if (getComputedStyle(node).position === 'static') node.style.position = 'relative';
    const img = document.createElement('img');
    img.setAttribute(payload.marker, 'true');
    img.setAttribute('aria-hidden', 'true');
    img.alt = '';
    img.src = payload.dataUrl;
    Object.assign(img.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      borderRadius: 'inherit',
      zIndex: '50',
      pointerEvents: 'none',
    });
    node.appendChild(img);
    return {
      cardId: node.getAttribute('data-id'),
      marker: img.getAttribute(payload.marker),
      source: img.src.slice(0, 64),
    };
  }, { marker: CANDIDATE_MARKER, dataUrl: candidateDataUrl() });

  expect(injected.cardId).toBe(targetCardId);
  expect(injected.marker).toBe('true');
  expect(injected.source).toContain('data:image/svg+xml');
  await expect(target.locator(`[${CANDIDATE_MARKER}="true"]`)).toBeVisible();
  await attachScreenshot(page, testInfo, 'art-practice-candidate-cards');

  const storedImmediatelyAfterInjection = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  expect(
    storedImmediatelyAfterInjection,
    'candidate-only visual injection must not change the current saved game state',
  ).toBe(storedImmediatelyBeforeInjection);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await expect(page.locator('section[data-screen="home"]')).toBeVisible();
  await expect(page.locator(`[${CANDIDATE_MARKER}="true"]`), 'candidate overlay must disappear after reload').toHaveCount(0);

  cards = await enterCardsFromHome(page);
  await expect(cards.locator(`[${CANDIDATE_MARKER}="true"]`), 'candidate never becomes current/formal art by test execution').toHaveCount(0);
  await attachScreenshot(page, testInfo, 'art-practice-reloaded-clean-cards');

  testInfo.annotations.push({
    type: 'preformal-use-site-practice',
    description: `card=${targetCardId}; viewport=${testInfo.project.name}; baseline→candidate→reload-clean; saved-state unchanged`,
  });
});
