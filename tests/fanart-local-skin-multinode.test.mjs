import test from 'node:test';
import assert from 'node:assert/strict';
import { installFanartLocalSkinCards } from '../browser/cards-deck-presentation.mjs';

function asyncRequest(result) {
  const request = { result, error: null };
  Object.defineProperty(request, 'onsuccess', {
    set(fn) { queueMicrotask(() => fn?.()); },
  });
  Object.defineProperty(request, 'onerror', { set() {} });
  return request;
}

function fakeIndexedDb() {
  const stores = {
    skins: new Map([['CARD_1', { baseCardId: 'CARD_1', assetHash: 'hash-1', opponentEnabled: false }]]),
    assets: new Map([['hash-1', { hash: 'hash-1', blob: { type: 'image/webp' }, mime: 'image/webp' }]]),
  };
  const db = {
    objectStoreNames: { contains: () => true },
    transaction() {
      const tx = {
        objectStore(name) {
          return {
            get(key) { return asyncRequest(stores[name].get(key) ?? null); },
          };
        },
      };
      Object.defineProperty(tx, 'oncomplete', {
        set(fn) { queueMicrotask(() => fn?.()); },
      });
      Object.defineProperty(tx, 'onerror', { set() {} });
      Object.defineProperty(tx, 'onabort', { set() {} });
      return tx;
    },
  };
  return {
    open() {
      const request = { result: db, error: null };
      Object.defineProperty(request, 'onupgradeneeded', { set() {} });
      Object.defineProperty(request, 'onsuccess', {
        set(fn) { queueMicrotask(() => fn?.()); },
      });
      Object.defineProperty(request, 'onerror', { set() {} });
      return request;
    },
  };
}

function fakeElement({ id = '', connected = true } = {}) {
  const children = [];
  const listeners = new Map();
  return {
    dataset: id ? { id } : {},
    children,
    isConnected: connected,
    parentNode: null,
    textContent: '',
    hidden: false,
    setAttribute() {},
    removeAttribute(name) {
      if (name === 'data-fanart-local-skin-host') delete this.dataset.fanartLocalSkinHost;
    },
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type) { listeners.delete(type); },
    appendChild(child) { child.parentNode = this; children.push(child); return child; },
    after(child) { child.parentNode = this.parentNode ?? this; },
    remove() { this.removed = true; this.isConnected = false; },
    querySelector(selector) {
      if (selector === '[data-role="fanart-local-skin-overlay"]') {
        return children.find((child) => child.dataset?.role === 'fanart-local-skin-overlay' && !child.removed) ?? null;
      }
      if (selector === 'button') return null;
      return null;
    },
    querySelectorAll() { return []; },
    closest() { return null; },
  };
}

function fakeCardsDom() {
  const collection = fakeElement({ id: 'CARD_1' });
  const deck = fakeElement({ id: 'CARD_1' });
  const screen = fakeElement();
  const anchor = fakeElement();
  anchor.parentNode = screen;
  screen.querySelectorAll = (selector) => selector === '#collectionGrid [data-id], #deckSlots [data-id], #exDeckSlots [data-id]'
    ? [collection, deck]
    : [];
  screen.querySelector = () => null;
  screen.contains = () => true;
  const head = fakeElement();
  const document = {
    head,
    documentElement: head,
    querySelector(selector) {
      if (selector === 'section[data-screen="cards"]') return screen;
      if (selector === '#r4DeckTrayToggle') return anchor;
      return null;
    },
    createElement(tag) {
      const node = fakeElement();
      node.tagName = String(tag).toUpperCase();
      return node;
    },
    getElementById() { return null; },
  };
  return { document, screen, collection, deck };
}

async function flushAsyncWork() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

test('same canonical card keeps independent live Blob URLs in Collection and Deck mirrors', async () => {
  const { document, collection, deck } = fakeCardsDom();
  const created = [];
  const revoked = [];
  const window = {
    URL: {
      createObjectURL() {
        const url = `blob:fanart-${created.length + 1}`;
        created.push(url);
        return url;
      },
      revokeObjectURL(url) { revoked.push(url); },
    },
  };

  const installation = installFanartLocalSkinCards({
    document,
    window,
    indexedDB: fakeIndexedDb(),
  });
  await flushAsyncWork();

  const collectionOverlay = collection.querySelector('[data-role="fanart-local-skin-overlay"]');
  const deckOverlay = deck.querySelector('[data-role="fanart-local-skin-overlay"]');
  assert.ok(collectionOverlay, 'Collection mirror should render its local skin');
  assert.ok(deckOverlay, 'Deck mirror should render its local skin');
  assert.notEqual(collectionOverlay.src, deckOverlay.src, 'each live DOM mirror owns its own Blob URL');
  assert.deepEqual(created, ['blob:fanart-1', 'blob:fanart-2']);
  assert.deepEqual(revoked, [], 'rendering another mirror must not revoke the first mirror URL');

  installation.destroy();
  assert.deepEqual(new Set(revoked), new Set(created), 'destroy revokes every live mirror URL');
});
