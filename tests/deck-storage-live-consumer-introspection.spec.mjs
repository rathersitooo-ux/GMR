import { test, expect } from '@playwright/test';

async function boot(page) {
  await page.addInitScript(() => {
    const registry = new WeakMap();
    const original = EventTarget.prototype.addEventListener;
    Object.defineProperty(window, '__GR_LISTENER_AUDIT__', { value: registry, configurable: true });
    EventTarget.prototype.addEventListener = function auditedAddEventListener(type, listener, options) {
      try {
        const source = typeof listener === 'function'
          ? Function.prototype.toString.call(listener)
          : listener && typeof listener.handleEvent === 'function'
            ? Function.prototype.toString.call(listener.handleEvent)
            : '';
        const rows = registry.get(this) ?? [];
        rows.push({
          type: String(type),
          source: source.slice(0, 10000),
          capture: typeof options === 'boolean' ? options : Boolean(options?.capture),
          passive: typeof options === 'object' ? Boolean(options?.passive) : false,
          once: typeof options === 'object' ? Boolean(options?.once) : false,
        });
        registry.set(this, rows);
      } catch {}
      return original.call(this, type, listener, options);
    };
  });

  const response = await page.goto('/browser/GAMEROAD.html', { waitUntil: 'domcontentloaded' });
  expect(response).not.toBeNull();
  expect(response.ok()).toBeTruthy();
  await page.waitForTimeout(1000);
  const cardsGo = page.locator('[data-home-target="cards"]:visible, [data-go="cards"]:visible').first();
  await expect(cardsGo).toBeVisible();
  await cardsGo.click();
  await expect(page.locator('section[data-screen="cards"]')).toBeVisible();
  await page.waitForTimeout(250);
}

function jsonAttachment(testInfo, name, value) {
  return testInfo.attach(name, {
    body: Buffer.from(JSON.stringify(value, null, 2)),
    contentType: 'application/json',
  });
}

test('discovers the current Cards deck authority and mount seam without product mutation', async ({ page }, testInfo) => {
  await boot(page);

  const snapshot = await page.evaluate(() => {
    const t = window.__GAMEROAD_TEST__ ?? null;
    const describe = (node) => {
      if (!node) return null;
      const attrs = {};
      for (const attr of [...node.attributes]) {
        if (attr.name === 'style') continue;
        attrs[attr.name] = attr.value;
      }
      return {
        tag: node.tagName,
        id: node.id || null,
        className: typeof node.className === 'string' ? node.className : null,
        attrs,
        text: (node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 220),
        parent: node.parentElement ? {
          tag: node.parentElement.tagName,
          id: node.parentElement.id || null,
          className: typeof node.parentElement.className === 'string' ? node.parentElement.className : null,
        } : null,
      };
    };
    const functionInfo = (owner, key) => {
      let value;
      try { value = owner?.[key]; } catch { return null; }
      if (typeof value !== 'function') return null;
      let source = '';
      try { source = Function.prototype.toString.call(value); } catch {}
      return { key, name: value.name || null, arity: value.length, source: source.slice(0, 2400) };
    };
    const listeners = (target) => {
      const rows = window.__GR_LISTENER_AUDIT__?.get?.(target) ?? [];
      return rows
        .filter((row) => /^(click|pointerdown|pointermove|pointerup|pointercancel|touchstart|touchmove|touchend|keydown)$/.test(row.type))
        .map((row) => ({ ...row, source: row.source.slice(0, 10000) }));
    };
    const sourceSlice = (marker, radius = 24000) => {
      for (const script of [...document.scripts]) {
        const source = script.textContent || '';
        const index = source.indexOf(marker);
        if (index < 0) continue;
        return {
          marker,
          scriptSrc: script.src || null,
          index,
          start: Math.max(0, index - radius),
          end: Math.min(source.length, index + radius),
          source: source.slice(Math.max(0, index - radius), Math.min(source.length, index + radius)),
        };
      }
      return null;
    };

    const testApiKeys = t ? Object.keys(t).sort() : [];
    const deckApi = t
      ? testApiKeys.filter((key) => /(deck|card|royal|draft|collection|save)/i.test(key)).map((key) => ({
          key,
          type: typeof t[key],
          function: functionInfo(t, key),
        }))
      : [];
    const stateKeys = t?.state && typeof t.state === 'object' ? Object.keys(t.state).sort() : [];
    const deckStateKeys = stateKeys.filter((key) => /(deck|card|royal|draft|collection|save)/i.test(key));
    const globalKeys = Object.keys(window).filter((key) => /(gameroad|deck|card|storage)/i.test(key)).sort();
    const interestingGlobals = globalKeys.slice(0, 260).map((key) => {
      let value;
      try { value = window[key]; } catch { return { key, type: 'throws' }; }
      return {
        key,
        type: typeof value,
        function: typeof value === 'function' ? functionInfo(window, key) : null,
        objectKeys: value && typeof value === 'object' && !Array.isArray(value)
          ? Object.keys(value).filter((child) => /(deck|card|storage|add|remove|save|draft|render|mount)/i.test(child)).slice(0, 120)
          : [],
      };
    });

    const cards = document.querySelector('section[data-screen="cards"]');
    const collectionGrid = document.querySelector('#collectionGrid');
    const inDeckCard = collectionGrid?.querySelector('button.slot.live.cardFace.inDeck') ?? null;
    const outsideDeckCard = collectionGrid?.querySelector('button.slot.live.cardFace:not(.inDeck)') ?? null;
    const deckTrayToggle = document.querySelector('#r4DeckTrayToggle');
    const restoreDeck = document.querySelector('#restoreDeck');
    const visibleButtons = cards
      ? [...cards.querySelectorAll('button')].filter((button) => {
          const style = getComputedStyle(button);
          const rect = button.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        }).map((button) => ({
          id: button.id || null,
          className: button.className || null,
          text: (button.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160),
          aria: button.getAttribute('aria-label'),
          data: { ...button.dataset },
        })).slice(0, 180)
      : [];

    const resources = performance.getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((name) => /\/browser\/.*\.(?:mjs|js)(?:\?|$)/.test(name))
      .map((name) => {
        try { return new URL(name).pathname; } catch { return name; }
      })
      .sort();

    return {
      href: location.href,
      deckApi,
      deckStateKeys,
      interestingGlobals,
      resources,
      sourceSlices: {
        deckSwipe: sourceSlice('GR_DECK_SWIPE_ADD_THRESHOLD_PX'),
        renderCards: sourceSlice('function renderCards'),
      },
      dom: {
        cards: describe(cards),
        collectionGrid: describe(collectionGrid),
        collectionGridParent: describe(collectionGrid?.parentElement),
        inDeckCard: describe(inDeckCard),
        outsideDeckCard: describe(outsideDeckCard),
        deckTrayToggle: describe(deckTrayToggle),
        deckTrayToggleParent: describe(deckTrayToggle?.parentElement),
        restoreDeck: describe(restoreDeck),
        restoreDeckParent: describe(restoreDeck?.parentElement),
        storageButton: describe(document.querySelector('[data-role="deck-storage-button"]')),
        visibleButtons,
      },
      listeners: {
        window: listeners(window),
        document: listeners(document),
        cards: listeners(cards),
        collectionGrid: listeners(collectionGrid),
        collectionGridParent: listeners(collectionGrid?.parentElement),
        inDeckCard: listeners(inDeckCard),
        outsideDeckCard: listeners(outsideDeckCard),
        deckTrayToggle: listeners(deckTrayToggle),
        restoreDeck: listeners(restoreDeck),
      },
    };
  });

  expect(snapshot.dom.cards).not.toBeNull();
  expect(snapshot.dom.collectionGrid).not.toBeNull();
  expect(snapshot.dom.storageButton).toBeNull();
  expect(snapshot.sourceSlices.deckSwipe).not.toBeNull();
  await jsonAttachment(testInfo, `${testInfo.project.name}-deck-storage-consumer-introspection.json`, snapshot);
});
