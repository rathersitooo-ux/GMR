import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  OVER_SEVEN_FORMS,
  applyLaneGain,
  gateOpenByMaxLane,
  gateOpenByTotal,
  goalArrivalPossible,
  invisibleCardCount,
} from '../browser/over-seven-trial-core.mjs';

const lane = (n) => Array.from({ length: n }, (_, i) => `c${i}`);

test('そのまま形：全部入って列は7を超える', () => {
  const r = applyLaneGain({ lane: lane(5), gained: ['a', 'b', 'c'], form: OVER_SEVEN_FORMS.UNLIMITED });
  assert.equal(r.lengthAfter, 8);
  assert.equal(r.destroyed.length, 0);
  assert.equal(r.heldBack.length, 0);
});

test('消滅形：7を超える分だけ消える', () => {
  const r = applyLaneGain({ lane: lane(5), gained: ['a', 'b', 'c'], form: OVER_SEVEN_FORMS.DESTROY });
  assert.equal(r.lengthAfter, 7);
  assert.deepEqual([...r.placed], ['a', 'b']);
  assert.deepEqual([...r.destroyed], ['c']);
  assert.equal(r.heldBack.length, 0);
});

test('上限形：7で止まり、超える分は消えずに残る', () => {
  const r = applyLaneGain({ lane: lane(5), gained: ['a', 'b', 'c'], form: OVER_SEVEN_FORMS.CAP });
  assert.equal(r.lengthAfter, 7);
  assert.deepEqual([...r.heldBack], ['c']);
  assert.equal(r.destroyed.length, 0);
});

test('すでに7枚の列への追加：消滅形は全部消え、上限形は全部残る', () => {
  const d = applyLaneGain({ lane: lane(7), gained: ['x'], form: OVER_SEVEN_FORMS.DESTROY });
  assert.equal(d.lengthAfter, 7);
  assert.deepEqual([...d.destroyed], ['x']);
  const c = applyLaneGain({ lane: lane(7), gained: ['x'], form: OVER_SEVEN_FORMS.CAP });
  assert.equal(c.lengthAfter, 7);
  assert.deepEqual([...c.heldBack], ['x']);
});

test('門の数え：1列数えと合計数えで開く場面が違う', () => {
  // 3列に3枚ずつ：合計は9で開くが、1列ではどこも7に届かず開かない。
  assert.equal(gateOpenByMaxLane([3, 3, 3]), false);
  assert.equal(gateOpenByTotal([3, 3, 3]), true);
  assert.equal(gateOpenByMaxLane([7, 0, 0]), true);
  assert.equal(gateOpenByTotal([7, 0, 0]), true);
});

test('ゴール到達の可否：ちょうど7の時だけ盤面に到達先がある', () => {
  assert.equal(goalArrivalPossible(6), false);
  assert.equal(goalArrivalPossible(7), true);
  assert.equal(goalArrivalPossible(8), false);
  assert.equal(goalArrivalPossible(34), false);
});

test('採用形：消滅した札は数字の合計がスコアになる', () => {
  const r = applyLaneGain({
    lane: lane(6),
    gained: [{ id: 'a', number: 5 }, { id: 'b', number: 9 }],
    form: OVER_SEVEN_FORMS.DESTROY,
  });
  assert.equal(r.lengthAfter, 7);
  assert.equal(r.destroyed.length, 1);
  assert.equal(r.destroyedScore, 9);
  const withFn = applyLaneGain({
    lane: lane(7),
    gained: ['x', 'y'],
    form: OVER_SEVEN_FORMS.DESTROY,
    scoreOf: () => 3,
  });
  assert.equal(withFn.destroyedScore, 6);
  const capped = applyLaneGain({
    lane: lane(7),
    gained: [{ id: 'z', number: 9 }],
    form: OVER_SEVEN_FORMS.CAP,
  });
  assert.equal(capped.destroyedScore, 0);
});

test('見えない札の数：深さ7を超えた分だけ数える', () => {
  assert.equal(invisibleCardCount([7, 3, 0]), 0);
  assert.equal(invisibleCardCount([14, 3, 0]), 7);
  assert.equal(invisibleCardCount([34, 0, 0]), 27);
});
