import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTO_RANK_SEASON_PHASE,
  advanceAutoRankSeasonPhase,
  createAutoRankSeasonRegistrationState,
  registerOpeningDeck,
} from '../browser/auto-rank-season-registration-core.mjs';
import {
  acceptAutoRankResultReceipt,
  createAutoRankResultReceiptLedger,
} from '../browser/auto-rank-result-receipt-ledger-core.mjs';
import {
  AUTO_RANK_RESULT_RECEIPT_PROJECTION,
  projectAutoRankResultReceipts,
} from '../browser/auto-rank-result-receipt-projection.mjs';

function validSelection() {
  return {
    savedDeck: { main: ['CARD_A', 'CARD_B'], ex: ['EX_1'] },
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

function openingState() {
  const registration = registerOpeningDeck(createAutoRankSeasonRegistrationState({
    seasonId: 'season-projection-01',
    competitionId: 'competition-projection-01',
    rulesVersion: 'rules-v1',
    cardVersion: 'cards-v1',
    aiVersion: 'ai-v1',
  }), {
    selection: validSelection(),
    registeredAt: '2026-08-28T20:10:00+09:00',
    validateDeck: acceptDeck,
  });
  return advanceAutoRankSeasonPhase(registration, {
    toPhase: AUTO_RANK_SEASON_PHASE.OPENING,
  });
}

function ledgerWithTwoReceipts() {
  const seasonState = openingState();
  let ledger = createAutoRankResultReceiptLedger({ seasonState });
  ledger = acceptAutoRankResultReceipt(ledger, {
    seasonState,
    resultId: 'result-001',
    receivedAt: '2026-08-28T22:00:00+09:00',
    payload: { externalSequence: 1, table: { winnerRef: 'left' } },
  });
  ledger = acceptAutoRankResultReceipt(ledger, {
    seasonState,
    resultId: 'result-002',
    receivedAt: '2026-08-28T21:00:00+09:00',
    payload: { externalSequence: 2, table: { winnerRef: 'right' } },
  });
  return ledger;
}

test('projects exact ledger identity and newest accepted receipt first without timestamp interpretation', () => {
  const ledger = ledgerWithTwoReceipts();
  const projected = projectAutoRankResultReceipts(ledger);

  assert.equal(AUTO_RANK_RESULT_RECEIPT_PROJECTION.schema, 'gameroad.auto-rank-result-receipt-projection.v1');
  assert.equal(projected.schema, 'gameroad.auto-rank-result-receipt-projection.v1');
  assert.equal(projected.sourceSchema, 'gameroad.auto-rank-result-receipt-ledger.v1');
  assert.equal(projected.seasonId, 'season-projection-01');
  assert.equal(projected.competitionId, 'competition-projection-01');
  assert.deepEqual(projected.versions, {
    rulesVersion: 'rules-v1',
    cardVersion: 'cards-v1',
    aiVersion: 'ai-v1',
  });
  assert.deepEqual(projected.receipts.map((receipt) => receipt.resultId), ['result-002', 'result-001']);
  assert.equal(projected.receipts[0].receivedAt, '2026-08-28T21:00:00+09:00');
});

test('projection canonicalizes a mutable serialized ledger without mutating or aliasing the source', () => {
  const raw = JSON.parse(JSON.stringify(ledgerWithTwoReceipts()));
  const before = JSON.parse(JSON.stringify(raw));
  const projected = projectAutoRankResultReceipts(raw);

  assert.deepEqual(raw, before);
  assert.notStrictEqual(projected.receipts[0], raw.receipts[1]);
  assert.notStrictEqual(projected.receipts[0].payload, raw.receipts[1].payload);
  assert.equal(Object.isFrozen(projected), true);
  assert.equal(Object.isFrozen(projected.versions), true);
  assert.equal(Object.isFrozen(projected.receipts), true);
  assert.equal(Object.isFrozen(projected.receipts[0]), true);
  assert.equal(Object.isFrozen(projected.receipts[0].payload), true);
  assert.throws(() => {
    projected.receipts[0].payload.externalSequence = 99;
  }, TypeError);
  assert.equal(raw.receipts[1].payload.externalSequence, 2);
});

test('projection is a transparent receipt read model and does not add reward, rank, daily, or outcome fields', () => {
  const projected = projectAutoRankResultReceipts(ledgerWithTwoReceipts());
  const receipt = projected.receipts[0];

  assert.deepEqual(Object.keys(projected).sort(), [
    'competitionId',
    'receipts',
    'schema',
    'seasonId',
    'sourceSchema',
    'versions',
  ]);
  assert.deepEqual(Object.keys(receipt).sort(), [
    'phaseAtReceipt',
    'payload',
    'receivedAt',
    'registration',
    'resultId',
  ]);
  assert.deepEqual(receipt.payload, {
    externalSequence: 2,
    table: { winnerRef: 'right' },
  });
  for (const field of ['reward', 'rank', 'daily', 'outcome']) {
    assert.equal(Object.hasOwn(receipt, field), false);
    assert.equal(Object.hasOwn(projected, field), false);
  }
});
