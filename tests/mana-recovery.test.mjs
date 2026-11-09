import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ALLOWED_COLORS,
  MAX_MANA,
  canRecoverMana,
  recoverMana,
  resetManaRecoveryTurn,
} from '../browser/mana-recovery.mjs';

function heartCard(id) {
  return { id, suit: 'HEART', number: 5 };
}

function spadeCard(id) {
  return { id, suit: 'SPADE', number: 5 };
}

function stateWith({ mana, hand }) {
  return { mana, hand, discarded: [], manaRecoveredThisTurn: 0 };
}

test('ハート1枚を切るとマナが1戻り、手札から抜けて捨て札へ移る', () => {
  const card = heartCard('h1');
  const state = stateWith({ mana: 5, hand: [card, spadeCard('s1')] });
  const result = recoverMana(state, card);
  assert.equal(result.ok, true);
  assert.equal(result.state.mana, 6);
  assert.deepEqual(result.state.hand.map((c) => c.id), ['s1']);
  assert.deepEqual(result.state.discarded.map((c) => c.id), ['h1']);
  assert.equal(result.state.manaRecoveredThisTurn, 1);
});

test('マナ9で切ると10で止まる（11にならない）', () => {
  const result = recoverMana(
    stateWith({ mana: 9, hand: [heartCard('h1')] }),
    heartCard('h1'),
  );
  assert.equal(result.ok, true);
  assert.equal(result.state.mana, MAX_MANA);
});

test('1ターンに2枚目は切れない', () => {
  const first = heartCard('h1');
  const second = heartCard('h2');
  const state = stateWith({ mana: 5, hand: [first, second] });
  const afterFirst = recoverMana(state, first);
  assert.equal(afterFirst.ok, true);
  const afterSecond = recoverMana(afterFirst.state, second);
  assert.equal(afterSecond.ok, false);
  assert.equal(afterSecond.reason, 'この番はもう1枚切っています');
  assert.equal(afterSecond.state, afterFirst.state);
});

test('番の始めに数え方を戻すと、また1枚切れる', () => {
  const first = heartCard('h1');
  const second = heartCard('h2');
  const state = stateWith({ mana: 5, hand: [first, second] });
  const afterFirst = recoverMana(state, first);
  const nextTurn = resetManaRecoveryTurn(afterFirst.state);
  assert.equal(nextTurn.manaRecoveredThisTurn, 0);
  const result = recoverMana(nextTurn, second);
  assert.equal(result.ok, true);
  assert.equal(result.state.mana, 7);
});

test('ハート以外（スペード）は切れず、理由が1行出る', () => {
  const card = spadeCard('s1');
  const state = stateWith({ mana: 5, hand: [card] });
  const result = recoverMana(state, card);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'その色のカードは切れません');
  assert.equal(result.state, state);
});

test('手札にないカードとマナ10のときは切れない', () => {
  const missing = recoverMana(
    stateWith({ mana: 5, hand: [heartCard('h1')] }),
    heartCard('h9'),
  );
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, '手札にそのカードがありません');
  const full = recoverMana(
    stateWith({ mana: 10, hand: [heartCard('h1')] }),
    heartCard('h1'),
  );
  assert.equal(full.ok, false);
  assert.equal(full.reason, 'マナがいっぱいです');
});

test('切れる色の仮置きはハート（HEART）だけ', () => {
  assert.deepEqual(ALLOWED_COLORS, ['HEART']);
  assert.equal(canRecoverMana(stateWith({ mana: 5, hand: [heartCard('h1')] }), heartCard('h1')).ok, true);
});
