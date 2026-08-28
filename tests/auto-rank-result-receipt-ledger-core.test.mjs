import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTO_RANK_SEASON_PHASE,
  advanceAutoRankSeasonPhase,
  createAutoRankSeasonRegistrationState,
  registerOpeningDeck,
  reregisterRegularDeck,
} from '../browser/auto-rank-season-registration-core.mjs';
import {
  AUTO_RANK_RESULT_RECEIPT_LEDGER_CORE,
  acceptAutoRankResultReceipt,
  createAutoRankResultReceiptLedger,
  findAutoRankResultReceipt,
  restoreAutoRankResultReceiptLedger,
} from '../browser/auto-rank-result-receipt-ledger-core.mjs';

function createSeason(overrides = {}) {
  return createAutoRankSeasonRegistrationState({
    seasonId: 'season-test-01',
    competitionId: 'competition-test-01',
    rulesVersion: 'rules-v1',
    cardVersion: 'cards-v1',
    aiVersion: 'ai-v1',
    ...overrides,
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

function registeredState(card = 'CARD_A') {
  return registerOpeningDeck(createSeason(), {
    selection: validSelection(card),
    registeredAt: '2026-08-28T20:10:00+09:00',
    validateDeck: acceptDeck,
  });
}

function openingState(card = 'CARD_A') {
  return advanceAutoRankSeasonPhase(registeredState(card), {
    toPhase: AUTO_RANK_SEASON_PHASE.OPENING,
  });
}

function regularState(card = 'CARD_A') {
  return advanceAutoRankSeasonPhase(openingState(card), {
    toPhase: AUTO_RANK_SEASON_PHASE.REGULAR,
  });
}

function finalState(card = 'CARD_A') {
  return advanceAutoRankSeasonPhase(regularState(card), {
    toPhase: AUTO_RANK_SEASON_PHASE.FINAL,
  });
}

function closedState(card = 'CARD_A') {
  return advanceAutoRankSeasonPhase(finalState(card), {
    toPhase: AUTO_RANK_SEASON_PHASE.CLOSED,
  });
}

function acceptOpeningResult(ledger, seasonState = openingState(), payload = { outcome: 'authoritative-A' }) {
  return acceptAutoRankResultReceipt(ledger, {
    seasonState,
    resultId: 'result-001',
    receivedAt: '2026-08-28T21:10:00+09:00',
    payload,
  });
}

test('creates a frozen empty ledger scoped to exact season, competition, and rules/card/AI versions', () => {
  const ledger = createAutoRankResultReceiptLedger({ seasonState: createSeason() });
  assert.equal(AUTO_RANK_RESULT_RECEIPT_LEDGER_CORE.schema, 'gameroad.auto-rank-result-receipt-ledger.v1');
  assert.equal(ledger.seasonId, 'season-test-01');
  assert.equal(ledger.competitionId, 'competition-test-01');
  assert.deepEqual(ledger.versions, {
    rulesVersion: 'rules-v1',
    cardVersion: 'cards-v1',
    aiVersion: 'ai-v1',
  });
  assert.deepEqual(ledger.receipts, []);
  assert.equal(Object.isFrozen(ledger), true);
  assert.equal(Object.isFrozen(ledger.versions), true);
  assert.equal(Object.isFrozen(ledger.receipts), true);
});

test('accepts an authoritative opening result and freezes the exact registration lineage and deck snapshot', () => {
  const seasonState = openingState('OPENING_CARD');
  const ledger = createAutoRankResultReceiptLedger({ seasonState });
  const next = acceptAutoRankResultReceipt(ledger, {
    seasonState,
    resultId: 'result-opening-01',
    receivedAt: '2026-08-28T21:10:00+09:00',
    payload: { table: { winnerRef: 'external-result', score: 7 }, source: 'authoritative-upstream' },
  });

  assert.equal(next.receipts.length, 1);
  const receipt = next.receipts[0];
  assert.equal(receipt.resultId, 'result-opening-01');
  assert.equal(receipt.phaseAtReceipt, AUTO_RANK_SEASON_PHASE.OPENING);
  assert.equal(receipt.registration.lane, 'OPENING');
  assert.equal(receipt.registration.revision, 1);
  assert.equal(receipt.registration.inheritedFrom, null);
  assert.deepEqual(receipt.registration.snapshot.deck.main, ['OPENING_CARD', 'CARD_B']);
  assert.equal(receipt.registration.snapshot.setup.mode, '4p');
  assert.equal(Object.isFrozen(receipt), true);
  assert.equal(Object.isFrozen(receipt.registration.snapshot.deck.main), true);
});

test('identical resultId retry is idempotent across key order and keeps the first receipt timestamp', () => {
  const seasonState = openingState();
  const empty = createAutoRankResultReceiptLedger({ seasonState });
  const first = acceptAutoRankResultReceipt(empty, {
    seasonState,
    resultId: 'result-001',
    receivedAt: '2026-08-28T21:10:00+09:00',
    payload: { nested: { z: 3, a: 1 }, flags: ['x', 'y'] },
  });
  const retry = acceptAutoRankResultReceipt(first, {
    seasonState,
    resultId: 'result-001',
    receivedAt: '2026-08-28T21:12:00+09:00',
    payload: { flags: ['x', 'y'], nested: { a: 1, z: 3 } },
  });

  assert.equal(retry.receipts.length, 1);
  assert.equal(retry.receipts[0].receivedAt, '2026-08-28T21:10:00+09:00');
  assert.deepEqual(retry.receipts[0].payload, first.receipts[0].payload);
});

test('same resultId with different payload fails closed instead of rewriting accepted evidence', () => {
  const seasonState = openingState();
  const first = acceptOpeningResult(createAutoRankResultReceiptLedger({ seasonState }), seasonState);
  assert.throws(
    () => acceptAutoRankResultReceipt(first, {
      seasonState,
      resultId: 'result-001',
      receivedAt: '2026-08-28T21:11:00+09:00',
      payload: { outcome: 'conflicting-B' },
    }),
    /AUTO_RANK_RESULT_ID_CONFLICT:result-001/,
  );
  assert.equal(first.receipts.length, 1);
  assert.equal(first.receipts[0].payload.outcome, 'authoritative-A');
});

test('new results are accepted only once competition has started and never after it is closed', () => {
  const registration = registeredState();
  const registrationLedger = createAutoRankResultReceiptLedger({ seasonState: registration });
  assert.throws(
    () => acceptAutoRankResultReceipt(registrationLedger, {
      seasonState: registration,
      resultId: 'too-early',
      receivedAt: '2026-08-28T20:20:00+09:00',
      payload: { external: true },
    }),
    /AUTO_RANK_RESULT_PHASE_NOT_ACCEPTING:REGISTRATION/,
  );

  const closed = closedState();
  const closedLedger = createAutoRankResultReceiptLedger({ seasonState: closed });
  assert.throws(
    () => acceptAutoRankResultReceipt(closedLedger, {
      seasonState: closed,
      resultId: 'too-late',
      receivedAt: '2026-08-30T20:20:00+09:00',
      payload: { external: true },
    }),
    /AUTO_RANK_RESULT_PHASE_NOT_ACCEPTING:CLOSED/,
  );
});

test('regular receipts preserve inherited opening lineage, then preserve a later regular re-registration revision independently', () => {
  const regular = regularState('OPENING_CARD');
  const empty = createAutoRankResultReceiptLedger({ seasonState: regular });
  const first = acceptAutoRankResultReceipt(empty, {
    seasonState: regular,
    resultId: 'regular-result-1',
    receivedAt: '2026-08-29T08:00:00+09:00',
    payload: { externalSequence: 1 },
  });
  assert.equal(first.receipts[0].registration.lane, 'REGULAR');
  assert.equal(first.receipts[0].registration.revision, 1);
  assert.deepEqual(first.receipts[0].registration.inheritedFrom, { lane: 'OPENING', revision: 1 });
  assert.deepEqual(first.receipts[0].registration.snapshot.deck.main, ['OPENING_CARD', 'CARD_B']);

  const reregistered = reregisterRegularDeck(regular, {
    selection: validSelection('REGULAR_CARD'),
    registeredAt: '2026-08-29T09:00:00+09:00',
    validateDeck: acceptDeck,
  });
  const second = acceptAutoRankResultReceipt(first, {
    seasonState: reregistered,
    resultId: 'regular-result-2',
    receivedAt: '2026-08-29T09:30:00+09:00',
    payload: { externalSequence: 2 },
  });

  assert.equal(second.receipts.length, 2);
  assert.deepEqual(second.receipts[0].registration.snapshot.deck.main, ['OPENING_CARD', 'CARD_B']);
  assert.equal(second.receipts[1].registration.revision, 2);
  assert.equal(second.receipts[1].registration.inheritedFrom, null);
  assert.deepEqual(second.receipts[1].registration.snapshot.deck.main, ['REGULAR_CARD', 'CARD_B']);
});

test('ledger refuses a season, competition, or rules/card/AI version mismatch before accepting a result', () => {
  const opening = openingState();
  const ledger = createAutoRankResultReceiptLedger({ seasonState: opening });

  assert.throws(
    () => acceptAutoRankResultReceipt(ledger, {
      seasonState: createSeason({ seasonId: 'other-season' }),
      resultId: 'result-x', receivedAt: '2026-08-28T21:10:00+09:00', payload: {},
    }),
    /AUTO_RANK_RESULT_LEDGER_SEASON_MISMATCH/,
  );
  assert.throws(
    () => acceptAutoRankResultReceipt(ledger, {
      seasonState: createSeason({ competitionId: 'other-competition' }),
      resultId: 'result-x', receivedAt: '2026-08-28T21:10:00+09:00', payload: {},
    }),
    /AUTO_RANK_RESULT_LEDGER_COMPETITION_MISMATCH/,
  );
  assert.throws(
    () => acceptAutoRankResultReceipt(ledger, {
      seasonState: createSeason({ aiVersion: 'ai-v2' }),
      resultId: 'result-x', receivedAt: '2026-08-28T21:10:00+09:00', payload: {},
    }),
    /AUTO_RANK_RESULT_LEDGER_VERSION_MISMATCH/,
  );
});

test('serialized ledger restores to a frozen canonical state and supports receipt lookup', () => {
  const seasonState = openingState();
  const accepted = acceptOpeningResult(createAutoRankResultReceiptLedger({ seasonState }), seasonState, {
    z: 2,
    a: { y: true, b: false },
  });
  const restored = restoreAutoRankResultReceiptLedger(JSON.parse(JSON.stringify(accepted)));

  assert.equal(Object.isFrozen(restored), true);
  assert.equal(Object.isFrozen(restored.receipts[0].payload), true);
  assert.deepEqual(Object.keys(restored.receipts[0].payload), ['a', 'z']);
  assert.equal(findAutoRankResultReceipt(restored, 'result-001')?.receivedAt, '2026-08-28T21:10:00+09:00');
  assert.equal(findAutoRankResultReceipt(restored, 'missing'), null);
});

test('payload must be deterministic JSON data: cycles, non-finite numbers, and executable values are rejected', () => {
  const seasonState = openingState();
  const ledger = createAutoRankResultReceiptLedger({ seasonState });
  const cyclic = {};
  cyclic.self = cyclic;

  assert.throws(
    () => acceptAutoRankResultReceipt(ledger, {
      seasonState, resultId: 'cycle', receivedAt: '2026-08-28T21:10:00+09:00', payload: cyclic,
    }),
    /AUTO_RANK_RESULT_JSON_CYCLE/,
  );
  assert.throws(
    () => acceptAutoRankResultReceipt(ledger, {
      seasonState, resultId: 'nan', receivedAt: '2026-08-28T21:10:00+09:00', payload: { score: Number.NaN },
    }),
    /AUTO_RANK_RESULT_JSON_NONFINITE/,
  );
  assert.throws(
    () => acceptAutoRankResultReceipt(ledger, {
      seasonState, resultId: 'fn', receivedAt: '2026-08-28T21:10:00+09:00', payload: { compute() {} },
    }),
    /AUTO_RANK_RESULT_JSON_UNSUPPORTED/,
  );
});

test('a delayed identical retry stays idempotent even after the season has already closed', () => {
  const opening = openingState();
  const accepted = acceptOpeningResult(createAutoRankResultReceiptLedger({ seasonState: opening }), opening, {
    externalReceipt: 'fixed-1',
  });
  const regular = advanceAutoRankSeasonPhase(opening, { toPhase: AUTO_RANK_SEASON_PHASE.REGULAR });
  const final = advanceAutoRankSeasonPhase(regular, { toPhase: AUTO_RANK_SEASON_PHASE.FINAL });
  const closed = advanceAutoRankSeasonPhase(final, { toPhase: AUTO_RANK_SEASON_PHASE.CLOSED });

  const retry = acceptAutoRankResultReceipt(accepted, {
    seasonState: closed,
    resultId: 'result-001',
    receivedAt: '2026-08-30T21:10:00+09:00',
    payload: { externalReceipt: 'fixed-1' },
  });
  assert.equal(retry.receipts.length, 1);
  assert.equal(retry.receipts[0].receivedAt, '2026-08-28T21:10:00+09:00');
});
