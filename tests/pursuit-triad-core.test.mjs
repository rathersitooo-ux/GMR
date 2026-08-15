import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PURSUIT_MODE_FINISHER,
  PURSUIT_MODE_NORMAL,
  PURSUIT_NO_HAND,
  applyHoneyWake,
  removePursuitPhysicalMana,
  resolvePursuitCard,
  resolvePursuitRound,
  resolvePursuitTriad,
} from '../browser/pursuit-triad-core.mjs';

const HANDS = ['club', 'diamond', 'spade'];
const BEATS = { club: 'diamond', diamond: 'spade', spade: 'club' };

function independentWinnerIds(hands) {
  const unique = [...new Set(hands)];
  if (unique.length === 0 || unique.length === 3) return [];
  let winnerHand;
  if (unique.length === 1) {
    winnerHand = unique[0];
  } else {
    const [a, b] = unique;
    winnerHand = BEATS[a] === b ? a : b;
  }
  return hands.flatMap((hand, index) => hand === winnerHand ? [`p${index}`] : []);
}

function enumerateHands(playerCount, visit, prefix = []) {
  if (prefix.length === playerCount) return visit(prefix);
  for (const hand of HANDS) enumerateHands(playerCount, visit, [...prefix, hand]);
}

test('exhaustive 2p/3p/4p winner sets match an independent reference', () => {
  const expectedDistributions = {
    2: { 0: 0, 1: 6, 2: 3 },
    3: { 0: 6, 1: 9, 2: 9, 3: 3 },
    4: { 0: 36, 1: 12, 2: 18, 3: 12, 4: 3 },
  };
  for (const playerCount of [2, 3, 4]) {
    const distribution = Object.create(null);
    enumerateHands(playerCount, (hands) => {
      const selections = hands.map((hand, index) => ({ playerId: `p${index}`, hand }));
      const actual = resolvePursuitTriad(selections).winners;
      const expected = independentWinnerIds(hands);
      assert.deepEqual(actual, expected, `${playerCount}p ${hands.join('/')}`);
      distribution[actual.length] = (distribution[actual.length] ?? 0) + 1;
    });
    for (const [winnerCount, expectedCount] of Object.entries(expectedDistributions[playerCount])) {
      assert.equal(distribution[winnerCount] ?? 0, expectedCount, `${playerCount}p winners=${winnerCount}`);
    }
  }
});

test('same hand makes every participating player a winner', () => {
  assert.deepEqual(
    resolvePursuitTriad([
      { playerId: 'p2', hand: 'club' },
      { playerId: 'p1', hand: 'club' },
    ]).winners,
    ['p1', 'p2'],
  );
});

test('two-hand state returns every holder of the beating hand', () => {
  assert.deepEqual(
    resolvePursuitTriad([
      { playerId: 'a', hand: 'diamond' },
      { playerId: 'b', hand: 'club' },
      { playerId: 'c', hand: 'club' },
      { playerId: 'd', hand: 'diamond' },
    ]).winners,
    ['b', 'c'],
  );
});

test('three normal hands produce no pursuit winner', () => {
  assert.deepEqual(
    resolvePursuitTriad([
      { playerId: 'a', hand: 'club' },
      { playerId: 'b', hand: 'diamond' },
      { playerId: 'c', hand: 'spade' },
    ]).winners,
    [],
  );
});

test('no-hand is excluded from both winner and loser participation', () => {
  const result = resolvePursuitTriad([
    { playerId: 'a', hand: PURSUIT_NO_HAND },
    { playerId: 'b', hand: 'spade' },
    { playerId: 'c', hand: 'spade' },
  ]);
  assert.deepEqual(result.nonParticipants, ['a']);
  assert.deepEqual(result.participants, ['b', 'c']);
  assert.deepEqual(result.winners, ['b', 'c']);
});

test('Dark, Heart, unknown hands, duplicates, and malformed players fail closed', () => {
  for (const hand of ['dark', 'heart', 'rock', null, undefined]) {
    assert.throws(() => resolvePursuitTriad([{ playerId: 'a', hand }]), TypeError);
  }
  assert.throws(() => resolvePursuitTriad([
    { playerId: 'a', hand: 'club' },
    { playerId: 'a', hand: 'diamond' },
  ]), /duplicate playerId/);
  assert.throws(() => resolvePursuitTriad([{ playerId: '', hand: 'club' }]), TypeError);
});

test('normal and finisher addends apply only after a win', () => {
  assert.deepEqual(resolvePursuitCard({ won: true, value: 5, mode: PURSUIT_MODE_NORMAL }), {
    battleAddend: 5,
    disposition: 'battle',
  });
  assert.deepEqual(resolvePursuitCard({ won: true, value: 5, mode: PURSUIT_MODE_FINISHER }), {
    battleAddend: 10,
    disposition: 'battle',
  });
  assert.deepEqual(resolvePursuitCard({ won: false, value: 5, mode: PURSUIT_MODE_FINISHER }), {
    battleAddend: 0,
    disposition: 'subdeck',
  });
});

test('invalid pursuit values and modes fail closed', () => {
  for (const value of [0, 8, -1, 1.5, Number.NaN, Infinity]) {
    assert.throws(() => resolvePursuitCard({ won: true, value }), TypeError);
  }
  assert.throws(() => resolvePursuitCard({ won: true, value: 3, mode: 'dark' }), TypeError);
});

test('complete round keeps winners in Battle and sends nonwinners to subdeck', () => {
  const result = resolvePursuitRound({
    selections: [
      { playerId: 'a', hand: 'club' },
      { playerId: 'b', hand: 'diamond' },
      { playerId: 'c', hand: 'club' },
    ],
    cards: [
      { playerId: 'c', value: 2, mode: PURSUIT_MODE_FINISHER },
      { playerId: 'b', value: 7, mode: PURSUIT_MODE_NORMAL },
      { playerId: 'a', value: 4, mode: PURSUIT_MODE_NORMAL },
    ],
  });
  assert.deepEqual(result.outcomes, [
    { playerId: 'a', hand: 'club', won: true, value: 4, mode: 'normal', battleAddend: 4, disposition: 'battle' },
    { playerId: 'b', hand: 'diamond', won: false, value: 7, mode: 'normal', battleAddend: 0, disposition: 'subdeck' },
    { playerId: 'c', hand: 'club', won: true, value: 2, mode: 'finisher', battleAddend: 4, disposition: 'battle' },
  ]);
});

test('round rejects missing, duplicate, or nonparticipant pursuit cards', () => {
  const selections = [
    { playerId: 'a', hand: 'club' },
    { playerId: 'b', hand: PURSUIT_NO_HAND },
  ];
  assert.throws(() => resolvePursuitRound({ selections, cards: [] }), /match participating players/);
  assert.throws(() => resolvePursuitRound({ selections, cards: [
    { playerId: 'a', value: 1 },
    { playerId: 'a', value: 2 },
  ] }), /duplicate pursuit card/);
  assert.throws(() => resolvePursuitRound({ selections, cards: [{ playerId: 'b', value: 1 }] }), /non-participant|match participating players/);
});

test('physical pursuit card removal reduces max and clamps available mana', () => {
  assert.deepEqual(removePursuitPhysicalMana({ physicalManaCount: 7, availableMana: 7 }), {
    physicalManaCount: 6,
    maximumMana: 6,
    availableMana: 6,
  });
  assert.deepEqual(removePursuitPhysicalMana({ physicalManaCount: 4, availableMana: 1 }), {
    physicalManaCount: 3,
    maximumMana: 3,
    availableMana: 1,
  });
});

test('Honey wakes only existing physical mana and cannot restore lost maximum', () => {
  const afterPursuit = removePursuitPhysicalMana({ physicalManaCount: 7, availableMana: 2 });
  const afterHoney = applyHoneyWake({
    physicalManaCount: afterPursuit.physicalManaCount,
    availableMana: afterPursuit.availableMana,
    wakeCount: 99,
  });
  assert.deepEqual(afterHoney, {
    physicalManaCount: 6,
    maximumMana: 6,
    availableMana: 6,
  });
});

test('resolution is deterministic and independent of input arrival order', () => {
  const a = resolvePursuitTriad([
    { playerId: 'z', hand: 'diamond' },
    { playerId: 'a', hand: 'club' },
    { playerId: 'm', hand: PURSUIT_NO_HAND },
    { playerId: 'b', hand: 'club' },
  ]);
  const b = resolvePursuitTriad([
    { playerId: 'b', hand: 'club' },
    { playerId: 'm', hand: PURSUIT_NO_HAND },
    { playerId: 'a', hand: 'club' },
    { playerId: 'z', hand: 'diamond' },
  ]);
  assert.deepEqual(a, b);
  assert.deepEqual(a.winners, ['a', 'b']);
});
