import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTO_RANK_SEASON_PHASE,
  AUTO_RANK_SEASON_REGISTRATION_CORE,
  advanceAutoRankSeasonPhase,
  createAutoRankSeasonRegistrationState,
  getActiveAutoRankRegistration,
  registerOpeningDeck,
  reregisterRegularDeck,
} from '../browser/auto-rank-season-registration-core.mjs';

function createSeason() {
  return createAutoRankSeasonRegistrationState({
    seasonId: 'season-test-01',
    competitionId: 'competition-test-01',
    rulesVersion: 'rules-v1',
    cardVersion: 'cards-v1',
    aiVersion: 'ai-v1',
  });
}

function validSelection(card = 'CARD_A') {
  return {
    savedDeck: { main: [card, 'CARD_B'], ex: ['EX_1'] },
    savedDeckRule: { id: 'FIRST_REGULATION', revision: 3 },
    setupMode: '4p',
    setupContent: 'road_shield',
    playerCharacterId: 'partner.naki',
    selectedPartnerId: 'partner.naki',
  };
}

function acceptDeck(deck, options) {
  return options?.forBattle === true && deck.main.length > 0 ? { ok: true } : { ok: false };
}

function openingState(card = 'CARD_A') {
  return registerOpeningDeck(createSeason(), {
    selection: validSelection(card),
    registeredAt: '2026-08-28T20:10:00+09:00',
    validateDeck: acceptDeck,
  });
}

function regularState(card = 'CARD_A') {
  const registered = openingState(card);
  const opening = advanceAutoRankSeasonPhase(registered, { toPhase: AUTO_RANK_SEASON_PHASE.OPENING });
  return advanceAutoRankSeasonPhase(opening, { toPhase: AUTO_RANK_SEASON_PHASE.REGULAR });
}

test('creates a deterministic frozen season identity with explicit rules/card/AI versions', () => {
  const state = createSeason();
  assert.equal(AUTO_RANK_SEASON_REGISTRATION_CORE.schema, 'gameroad.auto-rank-season-registration.v1');
  assert.equal(state.phase, AUTO_RANK_SEASON_PHASE.REGISTRATION);
  assert.equal(state.phaseRevision, 0);
  assert.deepEqual(state.versions, {
    rulesVersion: 'rules-v1',
    cardVersion: 'cards-v1',
    aiVersion: 'ai-v1',
  });
  assert.equal(state.openingRegistration, null);
  assert.equal(state.regularRegistration, null);
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.versions), true);
  assert.deepEqual(createSeason(), state);
});

test('season identity fails closed when any version needed for later AI dataset partitioning is absent', () => {
  const base = {
    seasonId: 'season-test-01',
    competitionId: 'competition-test-01',
    rulesVersion: 'rules-v1',
    cardVersion: 'cards-v1',
    aiVersion: 'ai-v1',
  };
  for (const field of ['seasonId', 'competitionId', 'rulesVersion', 'cardVersion', 'aiVersion']) {
    assert.throws(
      () => createAutoRankSeasonRegistrationState({ ...base, [field]: '' }),
      new RegExp(`${field.toUpperCase()}_REQUIRED`),
    );
  }
});

test('opening registration captures the existing immutable match-start snapshot and validates for Battle', () => {
  const selection = validSelection();
  const seen = [];
  const state = registerOpeningDeck(createSeason(), {
    selection,
    registeredAt: '2026-08-28T20:10:00+09:00',
    validateDeck: (deck, options) => {
      seen.push({ deck, options });
      return { ok: true };
    },
  });

  assert.deepEqual(seen, [{
    deck: { main: ['CARD_A', 'CARD_B'], ex: ['EX_1'] },
    options: { forBattle: true },
  }]);
  selection.savedDeck.main[0] = 'MUTATED';
  selection.savedDeck.ex.push('EX_2');

  assert.equal(state.openingRegistration.revision, 1);
  assert.equal(state.openingRegistration.registeredAt, '2026-08-28T20:10:00+09:00');
  assert.equal(state.openingRegistration.snapshot.schema, 'gameroad.browser.match-start-snapshot.v1');
  assert.equal(state.openingRegistration.snapshot.setup.mode, '4p');
  assert.deepEqual(state.openingRegistration.snapshot.deck.main, ['CARD_A', 'CARD_B']);
  assert.deepEqual(state.openingRegistration.snapshot.deck.ex, ['EX_1']);
  assert.equal(Object.isFrozen(state.openingRegistration), true);
  assert.equal(Object.isFrozen(state.openingRegistration.snapshot.deck.main), true);
});

test('registration period may replace the opening reservation without mutating older revisions', () => {
  const first = openingState('FIRST');
  const second = registerOpeningDeck(first, {
    selection: validSelection('SECOND'),
    registeredAt: '2026-08-28T20:20:00+09:00',
    validateDeck: acceptDeck,
  });

  assert.equal(first.openingRegistration.revision, 1);
  assert.deepEqual(first.openingRegistration.snapshot.deck.main, ['FIRST', 'CARD_B']);
  assert.equal(second.openingRegistration.revision, 2);
  assert.equal(second.openingRegistration.registeredAt, '2026-08-28T20:20:00+09:00');
  assert.deepEqual(second.openingRegistration.snapshot.deck.main, ['SECOND', 'CARD_B']);
});

test('Auto-Rank reservation accepts only the fixed four-player mode and rejects an invalid deck without state mutation', () => {
  const initial = createSeason();
  const twoPlayer = validSelection();
  twoPlayer.setupMode = '2p';
  assert.throws(
    () => registerOpeningDeck(initial, {
      selection: twoPlayer,
      registeredAt: '2026-08-28T20:10:00+09:00',
      validateDeck: acceptDeck,
    }),
    /AUTO_RANK_REQUIRES_4P/,
  );
  assert.throws(
    () => registerOpeningDeck(initial, {
      selection: validSelection(),
      registeredAt: '2026-08-28T20:10:00+09:00',
      validateDeck: () => ({ ok: false, errors: ['INVALID_FOR_AUTORANK'] }),
    }),
    /MATCH_START_DECK_INVALID:INVALID_FOR_AUTORANK/,
  );
  assert.equal(initial.openingRegistration, null);
});

test('phase advancement is monotonic and opening cannot start without a frozen registration', () => {
  const empty = createSeason();
  assert.throws(
    () => advanceAutoRankSeasonPhase(empty, { toPhase: AUTO_RANK_SEASON_PHASE.OPENING }),
    /OPENING_REGISTRATION_REQUIRED/,
  );
  const registered = openingState();
  assert.throws(
    () => advanceAutoRankSeasonPhase(registered, { toPhase: AUTO_RANK_SEASON_PHASE.REGULAR }),
    /AUTO_RANK_SEASON_PHASE_TRANSITION_INVALID/,
  );
  const opening = advanceAutoRankSeasonPhase(registered, { toPhase: AUTO_RANK_SEASON_PHASE.OPENING });
  assert.throws(
    () => advanceAutoRankSeasonPhase(opening, { toPhase: AUTO_RANK_SEASON_PHASE.REGISTRATION }),
    /AUTO_RANK_SEASON_PHASE_TRANSITION_INVALID/,
  );
});

test('opening phase permanently closes tournament deck editing', () => {
  const registered = openingState();
  const opening = advanceAutoRankSeasonPhase(registered, { toPhase: AUTO_RANK_SEASON_PHASE.OPENING });
  assert.equal(opening.phaseRevision, 1);
  assert.equal(getActiveAutoRankRegistration(opening), opening.openingRegistration);
  assert.throws(
    () => registerOpeningDeck(opening, {
      selection: validSelection('LATE'),
      registeredAt: '2026-08-28T21:00:00+09:00',
      validateDeck: acceptDeck,
    }),
    /OPENING_REGISTRATION_CLOSED/,
  );
  assert.deepEqual(opening.openingRegistration.snapshot.deck.main, ['CARD_A', 'CARD_B']);
});

test('opening-to-regular handoff automatically inherits the exact tournament snapshot with lineage', () => {
  const registered = openingState();
  const opening = advanceAutoRankSeasonPhase(registered, { toPhase: AUTO_RANK_SEASON_PHASE.OPENING });
  const regular = advanceAutoRankSeasonPhase(opening, { toPhase: AUTO_RANK_SEASON_PHASE.REGULAR });

  assert.equal(regular.phaseRevision, 2);
  assert.deepEqual(regular.regularRegistration.inheritedFrom, { lane: 'OPENING', revision: 1 });
  assert.equal(regular.regularRegistration.revision, 1);
  assert.equal(regular.regularRegistration.registeredAt, registered.openingRegistration.registeredAt);
  assert.equal(regular.regularRegistration.snapshot, regular.openingRegistration.snapshot);
  assert.equal(getActiveAutoRankRegistration(regular), regular.regularRegistration);
});

test('regular Auto-Rank may re-register a deck without rewriting opening-tournament evidence', () => {
  const regular = regularState('OPENING_CARD');
  const openingEvidence = regular.openingRegistration;
  const updated = reregisterRegularDeck(regular, {
    selection: validSelection('REGULAR_CARD'),
    registeredAt: '2026-08-29T09:00:00+09:00',
    validateDeck: acceptDeck,
  });

  assert.equal(updated.openingRegistration, openingEvidence);
  assert.deepEqual(updated.openingRegistration.snapshot.deck.main, ['OPENING_CARD', 'CARD_B']);
  assert.equal(updated.regularRegistration.revision, 2);
  assert.equal(updated.regularRegistration.inheritedFrom, null);
  assert.equal(updated.regularRegistration.registeredAt, '2026-08-29T09:00:00+09:00');
  assert.deepEqual(updated.regularRegistration.snapshot.deck.main, ['REGULAR_CARD', 'CARD_B']);
});

test('regular re-registration is allowed only during REGULAR, not opening, final, or closed phases', () => {
  const registered = openingState();
  const opening = advanceAutoRankSeasonPhase(registered, { toPhase: AUTO_RANK_SEASON_PHASE.OPENING });
  assert.throws(
    () => reregisterRegularDeck(opening, {
      selection: validSelection(), registeredAt: '2026-08-29T09:00:00+09:00', validateDeck: acceptDeck,
    }),
    /REGULAR_REREGISTRATION_NOT_OPEN/,
  );

  const regular = advanceAutoRankSeasonPhase(opening, { toPhase: AUTO_RANK_SEASON_PHASE.REGULAR });
  const final = advanceAutoRankSeasonPhase(regular, { toPhase: AUTO_RANK_SEASON_PHASE.FINAL });
  assert.throws(
    () => reregisterRegularDeck(final, {
      selection: validSelection(), registeredAt: '2026-08-29T10:00:00+09:00', validateDeck: acceptDeck,
    }),
    /REGULAR_REREGISTRATION_NOT_OPEN/,
  );
  const closed = advanceAutoRankSeasonPhase(final, { toPhase: AUTO_RANK_SEASON_PHASE.CLOSED });
  assert.equal(getActiveAutoRankRegistration(closed), null);
  assert.throws(
    () => advanceAutoRankSeasonPhase(closed, { toPhase: AUTO_RANK_SEASON_PHASE.CLOSED }),
    /AUTO_RANK_SEASON_ALREADY_CLOSED/,
  );
});

test('serialized season state can be restored and safely continue through the next phase', () => {
  const registered = openingState();
  const restored = JSON.parse(JSON.stringify(registered));
  assert.equal(Object.isFrozen(restored), false);
  const opening = advanceAutoRankSeasonPhase(restored, { toPhase: AUTO_RANK_SEASON_PHASE.OPENING });
  assert.equal(opening.phase, AUTO_RANK_SEASON_PHASE.OPENING);
  assert.equal(Object.isFrozen(opening), true);
  assert.deepEqual(opening.openingRegistration.snapshot.deck.main, ['CARD_A', 'CARD_B']);
});
