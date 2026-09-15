import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeckStorageCornerController } from '../browser/deck-storage-corner-runtime.mjs';

function fixture({ deck = [] } = {}) {
  let currentDeck = [...deck];
  const calls = { add: [], remove: [] };
  const controller = createDeckStorageCornerController({
    getDeck: () => [...currentDeck],
    addDeckCard: (cardId) => {
      calls.add.push(cardId);
      currentDeck.push(cardId);
      return { ok: true };
    },
    removeDeckCard: (cardId) => {
      calls.remove.push(cardId);
      const index = currentDeck.indexOf(cardId);
      if (index < 0) return { ok: false, reason: 'not-in-deck' };
      currentDeck.splice(index, 1);
      return { ok: true };
    },
    isRoyal: () => false,
  });
  return { controller, calls, deck: () => [...currentDeck] };
}

test('Collection-left never removes the same cardId from Deck', () => {
  const { controller, calls, deck } = fixture({ deck: ['same-card', 'other-card'] });
  const result = controller.applySwipe({
    surface: 'collection',
    cardId: 'same-card',
    deltaX: -90,
    deltaY: 3,
  });

  assert.equal(result.ok, false);
  assert.equal(result.action, 'none');
  assert.deepEqual(calls, { add: [], remove: [] });
  assert.deepEqual(deck(), ['same-card', 'other-card']);
  assert.equal(result.view.storageCount, 0);
});
