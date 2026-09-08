import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getHomeQuickSetSessionPreference,
  normalizeHomeQuickSetItems,
  resetHomeQuickSetSessionPreference,
  resolveHomeQuickSetConfiguration,
  setHomeQuickSetSessionPreference,
  swapHomeQuickSetOrder,
} from '../browser/home-quickset-settings-core.mjs';

const items = [
  { id: 'setup', label: 'Battle' },
  { id: 'shop', label: 'Shop' },
  { id: 'characters', label: 'Partner' },
  { id: 'cards', label: 'Deck' },
];

test('current real Home routes are normalized without inventing extra routes', () => {
  const normalized = normalizeHomeQuickSetItems(items);
  assert.deepEqual(normalized.map((item) => item.id), ['setup', 'shop', 'characters', 'cards']);
  assert.deepEqual(normalized.map((item) => item.label), ['対戦', 'ショップ', 'パートナー', 'カード']);
});

test('Settings order is applied to the cyclic Quick Set and missing routes remain appended', () => {
  const resolved = resolveHomeQuickSetConfiguration({
    items,
    fallbackSelectedId: 'setup',
    preference: { order: ['cards', 'setup', 'shop'], defaultId: 'cards' },
  });
  assert.deepEqual(resolved.items.map((item) => item.id), ['cards', 'setup', 'shop', 'characters']);
  assert.equal(resolved.selectedRouteId, 'cards');
  assert.equal(resolved.persistence, 'session-only');
});

test('invalid configured default never creates a fake route', () => {
  const resolved = resolveHomeQuickSetConfiguration({
    items,
    fallbackSelectedId: 'shop',
    preference: { order: ['not-a-route', 'cards'], defaultId: 'not-a-route' },
  });
  assert.deepEqual(resolved.items.map((item) => item.id), ['cards', 'setup', 'shop', 'characters']);
  assert.equal(resolved.selectedRouteId, 'shop');
});

test('two selected round buttons can swap positions like a puzzle editor', () => {
  assert.deepEqual(
    swapHomeQuickSetOrder(['setup', 'shop', 'characters', 'cards'], 'setup', 'cards'),
    ['cards', 'shop', 'characters', 'setup'],
  );
});

test('session preference freely changes zero-move default and can reset', () => {
  resetHomeQuickSetSessionPreference();
  setHomeQuickSetSessionPreference({ order: ['shop', 'cards', 'setup', 'characters'], defaultId: 'cards' });
  assert.deepEqual(getHomeQuickSetSessionPreference(), {
    order: ['shop', 'cards', 'setup', 'characters'],
    defaultId: 'cards',
    persistence: 'session-only',
  });
  resetHomeQuickSetSessionPreference();
  assert.deepEqual(getHomeQuickSetSessionPreference(), {
    order: [],
    defaultId: null,
    persistence: 'session-only',
  });
});
