import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  VOTE_UNLOCK_NORMAL_LINE,
  VOTE_UNLOCK_SALE_LINE,
  applyCardVoteToUnlockState,
  cardVoteMeterModel,
  cardVoteUnlockProgress,
  createCardVoteUnlockState,
  normalizeCardVoteUnlockState,
  setCardVoteSaleActive,
  voteUnlockLineFor,
} from '../browser/card-vote-unlock-core.mjs';

function voteN(state, cardId, stance, n) {
  let s = state;
  for (let i = 0; i < n; i += 1) s = applyCardVoteToUnlockState(s, { cardId, stance, at: '2026-11-10T00:00:00.000Z' });
  return s;
}

test('解禁ラインは通常10,000票、セール時は3票', () => {
  assert.equal(VOTE_UNLOCK_NORMAL_LINE, 10000);
  assert.equal(VOTE_UNLOCK_SALE_LINE, 3);
  assert.equal(voteUnlockLineFor('SP_A'), 10000);
  assert.equal(voteUnlockLineFor('SP_A', { saleActive: true }), 3);
});

test('G・E・Dは票数が未定なのでラインを引かない（通常もセールも）', () => {
  assert.equal(voteUnlockLineFor('GED'), null);
  assert.equal(voteUnlockLineFor('GED', { saleActive: true }), null);
  assert.equal(voteUnlockLineFor(''), null);
});

test('票は賛成と反対の合計で溜まり、内訳も残る', () => {
  let s = createCardVoteUnlockState();
  s = voteN(s, 'SP_A', 'for', 2);
  s = voteN(s, 'SP_A', 'against', 1);
  const p = cardVoteUnlockProgress(s, 'SP_A');
  assert.equal(p.tallyFor, 2);
  assert.equal(p.tallyAgainst, 1);
  assert.equal(p.tallyTotal, 3);
  assert.equal(p.unlocked, false);
  assert.ok(p.fillRatio > 0 && p.fillRatio < 1);
});

test('不正な票は数えない', () => {
  let s = createCardVoteUnlockState();
  s = applyCardVoteToUnlockState(s, { cardId: '', stance: 'for' });
  s = applyCardVoteToUnlockState(s, { cardId: 'SP_A', stance: 'maybe' });
  assert.equal(cardVoteUnlockProgress(s, 'SP_A').tallyTotal, 0);
});

test('セール時は3票で解禁し、解禁はセールが終わっても戻らない', () => {
  let s = setCardVoteSaleActive(createCardVoteUnlockState(), true);
  s = voteN(s, 'SP_A', 'for', 2);
  assert.equal(cardVoteUnlockProgress(s, 'SP_A').unlocked, false);
  s = voteN(s, 'SP_A', 'for', 1);
  const p = cardVoteUnlockProgress(s, 'SP_A');
  assert.equal(p.unlocked, true);
  assert.equal(p.fillRatio, 1);
  s = setCardVoteSaleActive(s, false);
  assert.equal(cardVoteUnlockProgress(s, 'SP_A').unlocked, true);
});

test('通常時に溜まっていた票は、セール開始の時点で届いていれば解禁になる', () => {
  let s = voteN(createCardVoteUnlockState(), 'HT_K', 'for', 5);
  assert.equal(cardVoteUnlockProgress(s, 'HT_K').unlocked, false);
  s = setCardVoteSaleActive(s, true);
  assert.equal(cardVoteUnlockProgress(s, 'HT_K').unlocked, true);
});

test('G・E・Dはどれだけ溜まってもこの仕組みでは解禁しない', () => {
  let s = setCardVoteSaleActive(createCardVoteUnlockState(), true);
  s = voteN(s, 'GED', 'for', 10);
  const p = cardVoteUnlockProgress(s, 'GED');
  assert.equal(p.tallyTotal, 10);
  assert.equal(p.hasLine, false);
  assert.equal(p.unlocked, false);
  assert.equal(cardVoteMeterModel(s, 'GED').kind, 'no-line');
});

test('メーターの形は数字を持たず、状態は3種類だけ', () => {
  let s = voteN(createCardVoteUnlockState(), 'SP_A', 'for', 1);
  const filling = cardVoteMeterModel(s, 'SP_A');
  assert.equal(filling.kind, 'filling');
  assert.ok(filling.fillRatio > 0 && filling.fillRatio < 1);
  assert.deepEqual(Object.keys(filling).sort(), ['cardId', 'fillRatio', 'kind', 'unlocked']);

  s = setCardVoteSaleActive(s, true);
  s = voteN(s, 'SP_A', 'for', 2);
  const full = cardVoteMeterModel(s, 'SP_A');
  assert.equal(full.kind, 'full');
  assert.equal(full.fillRatio, 1);
  assert.equal(full.unlocked, true);
});

test('保存された状態の読み直しは壊れた値を直す', () => {
  const s = normalizeCardVoteUnlockState({
    saleActive: 1,
    cards: { SP_A: { for: 2, against: 1, total: 1 }, BAD: null },
    importedKeys: ['a', 5, 'b'],
  });
  assert.equal(s.saleActive, true);
  assert.equal(s.cards.SP_A.total, 3);
  assert.deepEqual(s.importedKeys, ['a', 'b']);
  assert.deepEqual(normalizeCardVoteUnlockState(null), createCardVoteUnlockState());
  assert.deepEqual(normalizeCardVoteUnlockState('x'), createCardVoteUnlockState());
});
