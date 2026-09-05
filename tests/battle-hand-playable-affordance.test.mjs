import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const SOURCE_PATH = new URL('../browser/battle-janken-slidepad-runtime-mount.mjs', import.meta.url);

async function source() {
  return readFile(SOURCE_PATH, 'utf8');
}

test('playable marker projects only the existing ordinary-hand draggable gate', async () => {
  const text = await source();
  const markerSelector = 'section[data-screen="battle"] #hand .handCard[data-hand-aura-draggable="true"]:not([data-janken-reserved="true"])::after';
  assert.ok(text.includes(markerSelector));
  assert.ok(text.includes('content:"▲"'));
  assert.ok(text.includes('pointer-events:none'));
});

test('action base exists only when at least one current ordinary playable card exists', async () => {
  const text = await source();
  const baseSelector = 'section[data-screen="battle"] #hand:has(.handCard[data-hand-aura-draggable="true"]:not([data-janken-reserved="true"]))::before';
  assert.ok(text.includes(baseSelector));
  assert.ok(text.includes('border-bottom:0'));
  assert.ok(text.includes('radial-gradient(ellipse at 50% 100%'));
});

test('affordance does not add a second gameplay or input authority', async () => {
  const text = await source();
  const syncStart = text.indexOf('function syncHandZoneProjection');
  const syncEnd = text.indexOf('\nfunction entropyIndex', syncStart);
  assert.ok(syncStart >= 0 && syncEnd > syncStart);
  const sync = text.slice(syncStart, syncEnd);
  assert.ok(sync.includes("const selectable = !node.disabled && node.getAttribute?.('aria-disabled') !== 'true';"));
  assert.ok(sync.includes("node.dataset.handAuraDraggable = selectable ? 'true' : 'false';"));
  assert.equal(sync.includes('addEventListener'), false);
  assert.equal(sync.includes('.click('), false);
  assert.equal(sync.includes('onclick'), false);
});
