import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createDeckMatchStartSnapshotWithCardAccess,
  inspectDeckMatchStartCardAccess,
} from '../browser/deck-match-start-card-access-adapter.mjs';

function selection() {
  return {
    savedDeck: {
      main: ['OWNED_A', 'SEASON_B'],
      ex: ['TRIAL_C'],
    },
    savedDeckRule: { id: 'FIRST_REGULATION', revision: 3 },
    setupMode: '2p',
    setupContent: 'road_shield',
    playerCharacterId: 'partner.naki',
    selectedPartnerId: 'partner.saasuna',
  };
}

function accessPolicy() {
  return {
    ownedCardIds: ['OWNED_A'],
    seasonPass: { active: true, cardIds: ['SEASON_B'] },
    freeTrial: { active: true, allCards: false, cardIds: ['TRIAL_C'] },
  };
}

test('match-start adapter rejects a locked card before a battle snapshot exists', () => {
  let validateCalls = 0;

  assert.throws(
    () => createDeckMatchStartSnapshotWithCardAccess(selection(), {
      validateDeck() {
        validateCalls += 1;
        return { ok: true };
      },
      accessPolicy: {
        ownedCardIds: ['OWNED_A'],
        seasonPass: { active: false, cardIds: ['SEASON_B'] },
        freeTrial: { active: false, allCards: false, cardIds: ['TRIAL_C'] },
      },
    }),
    /MATCH_START_CARD_ACCESS_DENIED:SEASON_B,TRIAL_C/,
  );

  assert.equal(validateCalls, 0);
});

test('authorized temporary cards flow into the existing immutable match-start snapshot unchanged', () => {
  const source = selection();
  const seen = [];

  const snapshot = createDeckMatchStartSnapshotWithCardAccess(source, {
    validateDeck(deck, options) {
      seen.push({ deck, options });
      return { ok: true };
    },
    accessPolicy: accessPolicy(),
  });

  assert.deepEqual(seen, [{
    deck: {
      main: ['OWNED_A', 'SEASON_B'],
      ex: ['TRIAL_C'],
    },
    options: { forBattle: true },
  }]);

  assert.deepEqual(snapshot, {
    schema: 'gameroad.browser.match-start-snapshot.v1',
    deck: {
      main: ['OWNED_A', 'SEASON_B'],
      ex: ['TRIAL_C'],
      ruleId: 'FIRST_REGULATION',
      ruleRevision: 3,
    },
    setup: {
      mode: '2p',
      content: 'road_shield',
    },
    selection: {
      playerCharacterId: 'partner.naki',
      selectedPartnerId: 'partner.saasuna',
    },
  });

  source.savedDeck.main[0] = 'MUTATED';
  assert.equal(snapshot.deck.main[0], 'OWNED_A');
  assert.equal(Object.isFrozen(snapshot), true);
});

test('all-card free trial can authorize the whole saved deck without making cards owned', () => {
  const inspection = inspectDeckMatchStartCardAccess(selection(), {
    accessPolicy: {
      ownedCardIds: [],
      seasonPass: { active: false, cardIds: [] },
      freeTrial: { active: true, allCards: true, cardIds: [] },
    },
  });

  assert.equal(inspection.access.ok, true);
  assert.equal(
    inspection.access.entries.every((entry) =>
      entry.status === 'FREE_TRIAL' &&
      entry.permanentOwnership === false &&
      entry.temporaryAccess === true
    ),
    true,
  );
  assert.equal(inspection.selectionMutationAllowed, false);
  assert.equal(inspection.matchStateMutationAllowed, false);
});

test('adapter does not delete a locked saved deck while reporting access denial', () => {
  const source = selection();
  const before = structuredClone(source);

  const inspection = inspectDeckMatchStartCardAccess(source, {
    accessPolicy: {
      ownedCardIds: ['OWNED_A'],
      seasonPass: { active: false, cardIds: [] },
      freeTrial: { active: false, allCards: false, cardIds: [] },
    },
  });

  assert.equal(inspection.access.ok, false);
  assert.deepEqual(inspection.access.lockedCardIds, ['SEASON_B', 'TRIAL_C']);
  assert.deepEqual(source, before);
});

test('existing deck-rule validation still remains authoritative after card access passes', () => {
  assert.throws(
    () => createDeckMatchStartSnapshotWithCardAccess(selection(), {
      validateDeck: () => ({ ok: false, errors: ['ROYAL_COUNT_INVALID'] }),
      accessPolicy: accessPolicy(),
    }),
    /MATCH_START_DECK_INVALID:ROYAL_COUNT_INVALID/,
  );
});
