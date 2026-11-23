import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mapBattleJankenVisualOpponents,
  bindBattleJankenVisualOpponents,
  projectBattleJankenAttackerOnly,
} from '../browser/battle-janken-visual-opponent-map-core.mjs';

const allSeats = ['P1', 'P2', 'P3', 'P4'];
const positions = ['LEFT', 'CENTER', 'RIGHT'];
const expected = {
  P1: ['P2', 'P3', 'P4'],
  P2: ['P1', 'P3', 'P4'],
  P3: ['P1', 'P2', 'P4'],
  P4: ['P1', 'P2', 'P3'],
};
function input(attackerId = 'P1') {
  const slots = mapBattleJankenVisualOpponents({ attackerId, playerIds: allSeats });
  const hands = ['PAPER', 'ROCK', 'SCISSORS']; // intentionally not hand-order sorted
  return {
    attackerId,
    playerIds: ['P4', 'P2', 'P1', 'P3'], // input seat order must not change numbering
    visualCandidates: slots.map(({ position, opponentId }, i) => ({
      position,
      candidate: {
        jankenHand: hands[i],
        cardId: `card-${i}`,
        path: [i, { lane: `authoritative-path-${i}` }],
        opponentId,
        shieldLane: `authoritative-shield-${i}`,
      },
    })),
  };
}
for (const seat of allSeats) {
  test(`${seat}: left/middle/right maps to the other three players in number order`, () => {
    const slots = mapBattleJankenVisualOpponents({ attackerId: seat, playerIds: allSeats.slice().reverse() });
    assert.deepEqual(slots.map(({ position }) => position), positions);
    assert.deepEqual(slots.map(({ opponentId }) => opponentId), expected[seat]);
    assert.ok(!slots.some(({ opponentId }) => opponentId === seat));
    const bound = bindBattleJankenVisualOpponents(input(seat));
    assert.deepEqual(bound.slots.map((s) => s.opponentId), expected[seat]);
    assert.deepEqual(bound.slots.map((s) => s.package.jankenHand), ['PAPER', 'ROCK', 'SCISSORS']);
    assert.deepEqual(bound.slots.map((s) => s.package.shieldLane), ['authoritative-shield-0', 'authoritative-shield-1', 'authoritative-shield-2']);
    assert.deepEqual(bound.slots[1].package.path, [1, { lane: 'authoritative-path-1' }]);
    assert.strictEqual(projectBattleJankenAttackerOnly(bound, seat), bound.slots);
    for (const other of allSeats.filter((p) => p !== seat)) {
      assert.equal(projectBattleJankenAttackerOnly(bound, other), null);
    }
    assert.equal(projectBattleJankenAttackerOnly(bound, 'SPECTATOR'), null);
  });
}
test('rejects incorrect target, never silently remaps it', () => {
  const options = input();
  options.visualCandidates[1].candidate.opponentId = 'P4';
  assert.throws(() => bindBattleJankenVisualOpponents(options), /CENTER.*P3/);
});
test('rejects swapped visual slot labels even with correct candidate data', () => {
  const options = input();
  options.visualCandidates[0].position = 'RIGHT';
  assert.throws(() => bindBattleJankenVisualOpponents(options), /visual candidate position/);
});
test('does not invent route or Shield when authority data are absent', () => {
  const options = input();
  delete options.visualCandidates[0].candidate.shieldLane;
  assert.throws(() => bindBattleJankenVisualOpponents(options), /shieldLane/);
});
test('rejects repeated janken cards or hands', () => {
  const options = input();
  options.visualCandidates[2].candidate.cardId = 'card-1';
  assert.throws(() => bindBattleJankenVisualOpponents(options), /distinct assigned card/);
  const other = input();
  other.visualCandidates[2].candidate.jankenHand = 'ROCK';
  assert.throws(() => bindBattleJankenVisualOpponents(other), /distinct assigned card/);
});
test('rejects non-4-player layouts and invalid attacker rather than treating 2v2 as free-for-all', () => {
  assert.throws(() => mapBattleJankenVisualOpponents({ attackerId: 'P1', playerIds: ['P1', 'P2'] }), /four unique/);
  assert.throws(() => mapBattleJankenVisualOpponents({ attackerId: 'P1', playerIds: ['P1', 'P1', 'P3', 'P4'] }), /four unique/);
  assert.throws(() => mapBattleJankenVisualOpponents({ attackerId: 'P5', playerIds: allSeats }), /attackerId/);
});
test('rejects empty, missing and nonphysical candidate layouts', () => {
  assert.throws(() => bindBattleJankenVisualOpponents({ ...input(), visualCandidates: [] }), /three visible/);
  const options = input();
  options.visualCandidates[1].candidate.path = [];
  assert.throws(() => bindBattleJankenVisualOpponents(options), /path/);
});
