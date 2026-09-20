import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DECK_SWIPE_PRESENTATION_EVENTS,
  SETUP_QUICK_DECK_PREVIEW_CONTRACT,
  createDeckSwipeFeedbackDetail,
  createSetupQuickDeckPreview,
} from '../browser/cards-deck-presentation-core.mjs';

test('cards deck presentation core preserves the existing swipe presentation contract', () => {
  assert.equal(DECK_SWIPE_PRESENTATION_EVENTS.COMMIT, 'gameroad:deck-swipe-commit');
  assert.deepEqual(
    createDeckSwipeFeedbackDetail({ phase: 'commit', cardId: 'HT_8', reducedMotion: false }),
    {
      phase: 'commit',
      cardId: 'HT_8',
      reason: null,
      reducedMotion: false,
    },
  );
});


test('Setup Quick Deck projection is immutable and isolated from later source mutations', () => {
  const source = {
    selectedDeckNumber: 2,
    savedDeck: { main: ['SP_A', 'HT_2'], ex: ['EX_1'] },
    savedDeckRule: { id: 'FIRST_REGULATION', revision: 3 },
  };
  const before = structuredClone(source);
  const preview = createSetupQuickDeckPreview(source);

  assert.equal(SETUP_QUICK_DECK_PREVIEW_CONTRACT.readOnly, true);
  assert.equal(SETUP_QUICK_DECK_PREVIEW_CONTRACT.ownsDeck, false);
  assert.equal(SETUP_QUICK_DECK_PREVIEW_CONTRACT.mutatesDeck, false);
  assert.equal(SETUP_QUICK_DECK_PREVIEW_CONTRACT.mutatesSelection, false);
  assert.equal(SETUP_QUICK_DECK_PREVIEW_CONTRACT.validatesDeck, false);
  assert.deepEqual(source, before);
  assert.deepEqual(preview, {
    schema: 'gameroad.setup-quick-deck-preview.v1',
    selectedDeckNumber: 2,
    deck: {
      main: ['SP_A', 'HT_2'],
      ex: ['EX_1'],
      mainCount: 2,
      exCount: 1,
      rule: { id: 'FIRST_REGULATION', revision: 3 },
    },
    readOnly: true,
  });

  source.savedDeck.main[0] = 'MUTATED';
  source.savedDeck.ex.push('EX_2');
  source.savedDeckRule.id = 'OTHER';
  assert.deepEqual(preview.deck.main, ['SP_A', 'HT_2']);
  assert.deepEqual(preview.deck.ex, ['EX_1']);
  assert.deepEqual(preview.deck.rule, { id: 'FIRST_REGULATION', revision: 3 });
  assert.equal(Object.isFrozen(preview), true);
  assert.equal(Object.isFrozen(preview.deck), true);
  assert.equal(Object.isFrozen(preview.deck.main), true);
  assert.equal(Object.isFrozen(preview.deck.ex), true);
  assert.equal(Object.isFrozen(preview.deck.rule), true);
  assert.throws(() => preview.deck.main.push('SP_K'), TypeError);
});

test('Setup Quick Deck projection preserves caller-selected deck identity 1 to 3 without inventing legality', () => {
  for (const selectedDeckNumber of [1, 2, 3]) {
    const preview = createSetupQuickDeckPreview({
      selectedDeckNumber,
      savedDeck: { main: ['SP_A'], ex: [] },
      savedDeckRule: null,
    });
    assert.equal(preview.selectedDeckNumber, selectedDeckNumber);
    assert.equal(preview.deck.mainCount, 1);
    assert.equal(preview.deck.exCount, 0);
    assert.deepEqual(preview.deck.rule, { id: null, revision: null });
  }
});

test('Setup Quick Deck projection fails closed on malformed deck shape or opaque identity references', () => {
  assert.throws(
    () => createSetupQuickDeckPreview({ selectedDeckNumber: 0, savedDeck: { main: [], ex: [] } }),
    /SELECTED_DECK_NUMBER_INVALID/,
  );
  assert.throws(
    () => createSetupQuickDeckPreview({ selectedDeckNumber: 1, savedDeck: { main: 'SP_A', ex: [] } }),
    /SAVED_DECK_MAIN_REQUIRED/,
  );
  assert.throws(
    () => createSetupQuickDeckPreview({ selectedDeckNumber: 1, savedDeck: { main: [''], ex: [] } }),
    /SAVED_DECK_MAIN_CARD_ID_INVALID/,
  );
  assert.throws(
    () => createSetupQuickDeckPreview({
      selectedDeckNumber: 1,
      savedDeck: { main: ['SP_A'], ex: [] },
      savedDeckRule: { id: { nested: true }, revision: 1 },
    }),
    /SAVED_DECK_RULE_ID_INVALID/,
  );
});
