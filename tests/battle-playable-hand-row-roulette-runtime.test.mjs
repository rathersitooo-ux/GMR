import test from 'node:test';
import assert from 'node:assert/strict';

import {
  advanceBattlePlayableHandRowRouletteDrag,
  BATTLE_PLAYABLE_HAND_ROW_ROULETTE_CSS,
  BATTLE_PLAYABLE_HAND_ROW_ROULETTE_PLACEMENT,
  createBattlePlayableHandRowRouletteController,
  createBattlePlayableHandRowRouletteModel,
  prepareBattlePlayableHandRowRouletteCommit,
  reconcileBattlePlayableHandRowRouletteModel,
  selectBattlePlayableHandRowRouletteCard,
  stepBattlePlayableHandRowRoulette,
} from '../browser/battle-playable-hand-row-roulette-runtime.mjs';

const presentations = {
  a: { label: 'Aカード', suit: '♣', number: 3 },
  b: { label: 'Bカード', suit: '♦', number: 4 },
  c: { label: 'Cカード', suit: '♠', number: 2 },
  d: { label: 'Dカード', suit: '♥', number: 7 },
  e: { label: 'Eカード', suit: '♣', number: 5 },
  f: { label: 'Fカード', suit: '♦', number: 6 },
};

test('row roulette is a left-side Partner-upper-right stacked-row consumer and never replaces ordinary hand', () => {
  assert.deepEqual(BATTLE_PLAYABLE_HAND_ROW_ROULETTE_PLACEMENT, {
    side: 'LEFT',
    anchor: 'PARTNER_UPPER_RIGHT',
    orientation: 'VERTICAL_STACKED_ROWS',
    boardOcclusion: 'FORBIDDEN',
    ordinaryHandRemainsVisible: true,
  });
  assert.match(BATTLE_PLAYABLE_HAND_ROW_ROULETTE_CSS, /flex-direction:column/);
  assert.match(BATTLE_PLAYABLE_HAND_ROW_ROULETTE_CSS, /grBattleHandRouletteRow/);
});

test('roulette membership is exactly the caller-supplied playable ordinary-hand candidate IDs', () => {
  const model = createBattlePlayableHandRowRouletteModel({
    candidateCardIds: ['a', 'c', 'f'],
    cardPresentationById: presentations,
  });
  assert.deepEqual(model.candidateCardIds, ['a', 'c', 'f']);
  assert.deepEqual(model.rows.map((row) => row.cardId), ['f', 'a', 'c']);
  assert.equal(model.selectedCardId, 'a');
  assert.equal(model.rows.find((row) => row.selected)?.label, 'Aカード');
});

test('0, 1 and variable-N candidate sets fail safely without manufacturing fixed six slots', () => {
  const empty = createBattlePlayableHandRowRouletteModel({ candidateCardIds: [] });
  assert.equal(empty.selectedCardId, null);
  assert.deepEqual(empty.rows, []);
  assert.deepEqual(prepareBattlePlayableHandRowRouletteCommit(empty, []), {
    status: 'NO_SELECTION',
    cardId: null,
  });

  const one = createBattlePlayableHandRowRouletteModel({
    candidateCardIds: ['b'],
    cardPresentationById: presentations,
  });
  assert.equal(one.rows.length, 1);
  assert.equal(stepBattlePlayableHandRowRoulette(one, 1).selectedCardId, 'b');

  const six = createBattlePlayableHandRowRouletteModel({
    candidateCardIds: ['a', 'b', 'c', 'd', 'e', 'f'],
    cardPresentationById: presentations,
  });
  assert.equal(six.candidateCardIds.length, 6);
  assert.equal(six.rows.length, 5);
  assert.equal(six.rows.filter((row) => row.selected).length, 1);
});

test('detent drag reuses the cyclic roll and preserves carry across pointer-sized updates', () => {
  let model = createBattlePlayableHandRowRouletteModel({
    candidateCardIds: ['a', 'b', 'c'],
    cardPresentationById: presentations,
  });
  let result = advanceBattlePlayableHandRowRouletteDrag(model, { deltaPx: 19, detentPx: 36 });
  model = result.model;
  assert.equal(model.selectedCardId, 'a');
  assert.equal(model.state.carryPx, 19);
  result = advanceBattlePlayableHandRowRouletteDrag(model, { deltaPx: 18, detentPx: 36 });
  assert.equal(result.model.selectedCardId, 'b');
  assert.equal(result.detents.length, 1);
  assert.equal(result.model.state.carryPx, 1);
});

test('direct row selection changes focus only and never invents card execution', () => {
  const model = createBattlePlayableHandRowRouletteModel({
    candidateCardIds: ['a', 'b', 'c'],
    cardPresentationById: presentations,
  });
  const focused = selectBattlePlayableHandRowRouletteCard(model, 'c');
  assert.equal(focused.selectedCardId, 'c');
  assert.equal(selectBattlePlayableHandRowRouletteCard(focused, 'not-playable').selectedCardId, 'c');
});

test('commit is fail-closed when the focused card is absent from a fresh candidate projection', () => {
  const model = createBattlePlayableHandRowRouletteModel({
    candidateCardIds: ['a', 'b'],
    cardPresentationById: presentations,
    anchorCardId: 'b',
  });
  assert.deepEqual(prepareBattlePlayableHandRowRouletteCommit(model, ['a']), {
    status: 'STALE_SELECTION',
    cardId: 'b',
  });
  assert.deepEqual(prepareBattlePlayableHandRowRouletteCommit(model, ['a', 'b']), {
    status: 'READY',
    cardId: 'b',
  });
});

test('controller delegates one accepted roulette commit to the existing hand-card action exactly once', async () => {
  let candidateCardIds = ['a', 'b'];
  const delegated = [];
  const controller = createBattlePlayableHandRowRouletteController({
    getCandidateProjection: () => ({ candidateCardIds }),
    getCardPresentation: (id) => presentations[id],
    delegateHandCardAction: async (id) => {
      delegated.push(id);
      candidateCardIds = candidateCardIds.filter((cardId) => cardId !== id);
      return `existing-action:${id}`;
    },
  });

  controller.refresh();
  controller.select('b');
  const result = await controller.requestCommit();
  assert.deepEqual(result, {
    status: 'COMMITTED',
    cardId: 'b',
    result: 'existing-action:b',
  });
  assert.deepEqual(delegated, ['b']);
  assert.deepEqual(controller.snapshot().model.candidateCardIds, ['a']);
});

test('rapid commit intents stay ordered and each revalidates after the prior state change', async () => {
  let candidateCardIds = ['a', 'b'];
  const delegated = [];
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });

  const controller = createBattlePlayableHandRowRouletteController({
    getCandidateProjection: () => ({ candidateCardIds }),
    delegateHandCardAction: async (id) => {
      delegated.push(id);
      if (delegated.length === 1) {
        await firstGate;
        candidateCardIds = candidateCardIds.filter((cardId) => cardId !== id);
      }
      return id;
    },
  });

  controller.refresh();
  const first = controller.requestCommit('a');
  const second = controller.requestCommit('a');
  assert.equal(controller.snapshot().queuedCount, 2);
  releaseFirst();

  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(firstResult.status, 'COMMITTED');
  assert.deepEqual(secondResult, {
    status: 'REJECTED_STALE',
    cardId: 'a',
  });
  assert.deepEqual(delegated, ['a']);
  assert.equal(controller.snapshot().queuedCount, 0);
});

test('controller never filters or expands membership beyond the existing candidate projection', () => {
  const controller = createBattlePlayableHandRowRouletteController({
    getCandidateProjection: () => ({ candidateCardIds: ['d', 'b'] }),
    delegateHandCardAction: () => null,
  });
  const snapshot = controller.refresh();
  assert.deepEqual(snapshot.candidateCardIds, ['d', 'b']);
});

test('reduced motion and low-performance presentation preserve the same card meaning', () => {
  const normal = createBattlePlayableHandRowRouletteModel({
    candidateCardIds: ['a', 'b', 'c'],
    cardPresentationById: presentations,
  });
  const reduced = createBattlePlayableHandRowRouletteModel({
    candidateCardIds: ['a', 'b', 'c'],
    cardPresentationById: presentations,
    reducedMotion: true,
    lowPerf: true,
  });
  assert.deepEqual(reduced.candidateCardIds, normal.candidateCardIds);
  assert.deepEqual(reduced.rows.map((row) => row.cardId), normal.rows.map((row) => row.cardId));
  assert.equal(reduced.selectedCardId, normal.selectedCardId);
  assert.equal(reduced.reducedMotion, true);
  assert.equal(reduced.lowPerf, true);
});

test('reconcile preserves a still-valid focus and fails over to the first fresh candidate when it disappears', () => {
  let model = createBattlePlayableHandRowRouletteModel({
    candidateCardIds: ['a', 'b', 'c'],
    cardPresentationById: presentations,
    anchorCardId: 'b',
  });
  model = reconcileBattlePlayableHandRowRouletteModel(model, {
    candidateCardIds: ['b', 'c', 'd'],
    cardPresentationById: presentations,
  });
  assert.equal(model.selectedCardId, 'b');
  model = reconcileBattlePlayableHandRowRouletteModel(model, {
    candidateCardIds: ['c', 'd'],
    cardPresentationById: presentations,
  });
  assert.equal(model.selectedCardId, 'c');
});
