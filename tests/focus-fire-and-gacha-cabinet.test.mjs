import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFocusFireRule, totalDamageTo } from '../browser/focus-fire-core.mjs';
import { buildCabinetSequence, capsuleColorFor, totalDurationMs } from '../browser/gacha-cabinet-core.mjs';

test('コンビ打ち対策：1人だけの攻撃はそのまま。重なると2人目以降が弱まる', () => {
  const single = applyFocusFireRule([{ attackerId: 'A', targetId: 'T', power: 100 }]);
  assert.equal(single.adjusted[0].power, 100);
  assert.deepEqual(single.focusedTargets, []);
  const duo = applyFocusFireRule([
    { attackerId: 'A', targetId: 'T', power: 100 },
    { attackerId: 'B', targetId: 'T', power: 100 },
  ]);
  assert.equal(totalDamageTo(duo.adjusted, 'T'), 170); // 100 + 70
  assert.deepEqual(duo.focusedTargets, ['T']);
  const trio = applyFocusFireRule([
    { attackerId: 'A', targetId: 'T', power: 100 },
    { attackerId: 'B', targetId: 'T', power: 100 },
    { attackerId: 'C', targetId: 'T', power: 100 },
  ]);
  assert.equal(totalDamageTo(trio.adjusted, 'T'), 220); // 100 + 70 + 50
});

test('コンビ打ち対策：同時計画なので、入力の並び順で結果が変わらない', () => {
  const a = applyFocusFireRule([
    { attackerId: 'A', targetId: 'T', power: 80 },
    { attackerId: 'B', targetId: 'T', power: 100 },
  ]);
  const b = applyFocusFireRule([
    { attackerId: 'B', targetId: 'T', power: 100 },
    { attackerId: 'A', targetId: 'T', power: 80 },
  ]);
  const key = (r) => r.adjusted.map((x) => `${x.attackerId}:${x.power}`).sort().join(',');
  assert.equal(key(a), key(b));
  // 大きい方が満額になる
  assert.equal(a.adjusted.find((x) => x.attackerId === 'B').power, 100);
});

test('ガチャ筐体：段取りは予告つきで、一番良い物が最後に開く', () => {
  const seq = buildCabinetSequence(['common', 'legend', 'rare']);
  assert.equal(seq.best, 'legend');
  assert.deepEqual(seq.revealOrder, ['common', 'rare', 'legend']);
  assert.equal(seq.steps.at(-1).rarity, 'legend');
  assert.equal(seq.steps.find((s) => s.kind === 'hint').color, 'rainbow');
  assert.ok(totalDurationMs(seq) > 3000);
  assert.equal(capsuleColorFor('super'), 'gold');
  assert.deepEqual(buildCabinetSequence([]).steps, []);
});
