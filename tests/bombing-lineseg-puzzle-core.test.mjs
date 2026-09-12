import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ARTIFACT_VERSION,
  DEFAULT_GEOMETRY,
  RULES_VERSION,
  SEGMENT_COUNT,
  applyDragPath,
  countImmediateScoringSwaps,
  createReplayReceipt,
  evaluateDrag,
  findScoringGroups,
  generateBoard,
  powerForGroupSize,
  replayReceipt,
} from '../browser/bombing-lineseg-puzzle-core.mjs';

test('canonical geometry is exactly 60 independent segments', () => {
  assert.equal(DEFAULT_GEOMETRY.edges.length, SEGMENT_COUNT);
  assert.equal(DEFAULT_GEOMETRY.adjacency.length, SEGMENT_COUNT);
  for (let i = 0; i < SEGMENT_COUNT; i += 1) {
    for (const j of DEFAULT_GEOMETRY.adjacency[i]) {
      assert.ok(DEFAULT_GEOMETRY.adjacency[j].includes(i));
    }
  }
});

test('group strength remains 3=>1, 4=>2, 5+=>3', () => {
  assert.equal(powerForGroupSize(2), 0);
  assert.equal(powerForGroupSize(3), 1);
  assert.equal(powerForGroupSize(4), 2);
  assert.equal(powerForGroupSize(5), 3);
  assert.equal(powerForGroupSize(20), 3);
});

test('board generator is deterministic, starts unscored, and exposes at least two immediate legal scoring swaps', () => {
  for (let seed = 1; seed <= 500; seed += 1) {
    const first = generateBoard(seed);
    const second = generateBoard(seed);
    assert.deepEqual(first, second, `seed ${seed} was not deterministic`);
    assert.equal(first.length, SEGMENT_COUNT);
    assert.equal(findScoringGroups(first).length, 0, `seed ${seed} starts with an already-scored group`);
    assert.ok(countImmediateScoringSwaps(first, DEFAULT_GEOMETRY, 2) >= 2, `seed ${seed} lacks two legal scoring swaps`);
  }
});

test('drag performs sequential adjacent swaps and rejects non-adjacent traversal', () => {
  const colors = [...Array(SEGMENT_COUNT)].map((_, i) => i % 4);
  const start = 0;
  const first = DEFAULT_GEOMETRY.adjacency[start][0];
  const second = DEFAULT_GEOMETRY.adjacency[first].find((id) => id !== start);
  assert.notEqual(second, undefined);

  const moved = applyDragPath(colors, [start, first, second]);
  assert.equal(moved.swaps.length, 2);
  assert.equal(moved.held, second);

  const illegal = [...Array(SEGMENT_COUNT).keys()].find((id) => id !== start && !DEFAULT_GEOMETRY.adjacency[start].includes(id));
  assert.throws(() => applyDragPath(colors, [start, illegal]), /illegal drag step/);
});

test('versioned receipt replays exactly under the pinned rules version', () => {
  const seed = 20260912;
  const board = generateBoard(seed);
  let scoringPair = null;
  for (let i = 0; i < SEGMENT_COUNT && !scoringPair; i += 1) {
    for (const j of DEFAULT_GEOMETRY.adjacency[i]) {
      if (i >= j) continue;
      const result = evaluateDrag(board, [i, j], 0);
      if (result.groups.length) {
        scoringPair = [i, j];
        break;
      }
    }
  }
  assert.ok(scoringPair);

  const receipt = createReplayReceipt({ seed, path: scoringPair, selfSuit: 0 });
  assert.equal(receipt.rulesVersion, RULES_VERSION);
  assert.equal(receipt.artifactVersion, ARTIFACT_VERSION);
  assert.deepEqual(replayReceipt(receipt), evaluateDrag(board, scoringPair, 0));
  assert.throws(() => replayReceipt({ ...receipt, rulesVersion: 'STALE_RULES' }), /rulesVersion mismatch/);
});
