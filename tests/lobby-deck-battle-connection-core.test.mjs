import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBattleStartSnapshot,
  createLobbyDeckBattleConnection,
} from '../browser/lobby-deck-battle-connection-core.mjs';

function validState() {
  return {
    savedDeck: { main: ['SP_A', 'HT_2'], ex: ['EX_1'] },
    savedDeckRule: { id: 'FIRST_REGULATION', revision: 3 },
    setupMode: '2p',
    setupContent: 'road_shield',
    playerCharacterId: 'partner.naki',
    selectedPartnerId: 'partner.naki',
  };
}

test('captures an immutable deterministic deck/setup selection snapshot before match start', () => {
  const state = validState();
  const validations = [];
  const starts = [];
  const connection = createLobbyDeckBattleConnection({
    getState: () => state,
    validateDeck: (deck, options) => {
      validations.push({ deck, options });
      return { ok: true };
    },
    startMatch: (snapshot) => starts.push(snapshot),
  });

  const snapshot = connection.start();
  assert.equal(validations.length, 1);
  assert.deepEqual(validations[0].options, { forBattle: true });
  assert.deepEqual(validations[0].deck, { main: ['SP_A', 'HT_2'], ex: ['EX_1'] });
  assert.equal(starts.length, 1);
  assert.strictEqual(starts[0], snapshot);
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.deck));
  assert.ok(Object.isFrozen(snapshot.deck.main));

  state.savedDeck.main[0] = 'MUTATED';
  state.savedDeck.ex.push('EX_2');
  state.setupMode = '4p';
  state.setupContent = 'honey_hunt';
  state.selectedPartnerId = 'partner.other';

  assert.deepEqual(snapshot, {
    schema: 'gameroad.browser.match-start-snapshot.v1',
    deck: {
      main: ['SP_A', 'HT_2'],
      ex: ['EX_1'],
      ruleId: 'FIRST_REGULATION',
      ruleRevision: 3,
    },
    setup: { mode: '2p', content: 'road_shield' },
    selection: {
      playerCharacterId: 'partner.naki',
      selectedPartnerId: 'partner.naki',
    },
  });

  assert.throws(() => snapshot.deck.main.push('SP_K'), TypeError);
});

test('same current selection produces the same snapshot without time/random fields', () => {
  const validateDeck = () => ({ ok: true });
  assert.deepEqual(
    createBattleStartSnapshot(validState(), { validateDeck }),
    createBattleStartSnapshot(validState(), { validateDeck }),
  );
});

test('invalid deck fails closed and never invokes match start', () => {
  let starts = 0;
  const connection = createLobbyDeckBattleConnection({
    getState: validState,
    validateDeck: () => ({ ok: false, errors: ['ROYAL_COUNT_INVALID'] }),
    startMatch: () => { starts += 1; },
  });

  assert.throws(() => connection.start(), /MATCH_START_DECK_INVALID:ROYAL_COUNT_INVALID/);
  assert.equal(starts, 0);
});

test('missing setup fails closed before invoking match start', () => {
  const state = validState();
  state.setupContent = '';
  let starts = 0;
  const connection = createLobbyDeckBattleConnection({
    getState: () => state,
    validateDeck: () => ({ ok: true }),
    startMatch: () => { starts += 1; },
  });

  assert.throws(() => connection.start(), /MATCH_START_SETUP_REQUIRED/);
  assert.equal(starts, 0);
});
