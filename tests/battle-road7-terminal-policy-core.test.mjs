import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ROAD7_TERMINAL_POLICY,
  resolveRoad7TerminalWinners,
} from '../browser/battle-road7-terminal-policy-core.mjs';

const lane = (count) => Array.from({ length: count }, (_, index) => `card-${index}`);

function player(id, team, depths) {
  return {
    id,
    team,
    lanes: Object.fromEntries(depths.map((depth, index) => [`L${index + 1}`, lane(depth)])),
  };
}

test('legacy non-2v2 keeps the existing >=7 immediate winner threshold', () => {
  const players = [
    player('p1', null, [6, 1, 0]),
    player('p2', null, [7, 0, 0]),
    player('p3', null, [1, 8, 0]),
    player('p4', null, [0, 0, 0]),
  ];

  const winners = resolveRoad7TerminalWinners({
    policy: ROAD7_TERMINAL_POLICY.LEGACY_IMMEDIATE_MATCH_WIN,
    mode: '4p',
    players,
  });

  assert.deepEqual(winners, ['p2', 'p3']);
  assert.equal(Object.isFrozen(winners), true);
});

test('legacy 2v2 preserves team dedupe and simultaneous A/B winners', () => {
  const players = [
    player('a1', 'A', [7, 0, 0]),
    player('a2', 'A', [8, 0, 0]),
    player('b1', 'B', [0, 7, 0]),
    player('b2', 'B', [6, 0, 0]),
  ];

  assert.deepEqual(
    resolveRoad7TerminalWinners({
      policy: ROAD7_TERMINAL_POLICY.LEGACY_IMMEDIATE_MATCH_WIN,
      mode: '2v2',
      players,
    }),
    ['A', 'B'],
  );
});

test('legacy 2v2 returns no winner below seven', () => {
  const players = [
    player('a1', 'A', [6, 6, 6]),
    player('b1', 'B', [6, 6, 6]),
  ];

  assert.deepEqual(
    resolveRoad7TerminalWinners({
      policy: ROAD7_TERMINAL_POLICY.LEGACY_IMMEDIATE_MATCH_WIN,
      mode: '2v2',
      players,
    }),
    [],
  );
});

test('non-terminal policy never turns ROAD7 into a match winner', () => {
  const winners = resolveRoad7TerminalWinners({
    policy: ROAD7_TERMINAL_POLICY.NON_TERMINAL,
    mode: '4p',
    players: [player('p1', null, [99, 99, 99])],
  });

  assert.deepEqual(winners, []);
  assert.equal(Object.isFrozen(winners), true);
});

test('terminal policy must be explicit and unknown policies fail closed', () => {
  assert.throws(() => resolveRoad7TerminalWinners(), /explicit ROAD7 terminal policy/);
  assert.throws(
    () => resolveRoad7TerminalWinners({ policy: 'NEW_UNKNOWN_POLICY' }),
    /explicit ROAD7 terminal policy/,
  );
});

test('legacy policy validates lane shape without mutating caller state', () => {
  const players = [player('p1', null, [7, 0, 0])];
  const before = structuredClone(players);

  resolveRoad7TerminalWinners({
    policy: ROAD7_TERMINAL_POLICY.LEGACY_IMMEDIATE_MATCH_WIN,
    mode: '4p',
    players,
  });
  assert.deepEqual(players, before);

  assert.throws(
    () =>
      resolveRoad7TerminalWinners({
        policy: ROAD7_TERMINAL_POLICY.LEGACY_IMMEDIATE_MATCH_WIN,
        mode: '4p',
        players: [{ id: 'bad', lanes: { L1: 7 } }],
      }),
    /lane must be an array/,
  );
});
