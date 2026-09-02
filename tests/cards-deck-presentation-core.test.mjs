import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DECK_SWIPE_PRESENTATION_EVENTS,
  createDeckSwipeFeedbackDetail,
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
