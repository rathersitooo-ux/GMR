import assert from 'node:assert/strict';
import test from 'node:test';

import {
  projectPlayerRemaining,
  projectRemainingToSeven,
  readRemainingLaneLengths,
} from '../browser/battle-remaining-to-seven-core.mjs';

function player(id, lanes, extra = {}) {
  return { id, name: `名前${id}`, lanes, ...extra };
}

test('数え方: 一番進んだ道から残りを数える（対戦本体の門の判定と同じ）', () => {
  const row = projectPlayerRemaining(player('P1', { L: ['a', 'b'], C: ['a', 'b', 'c', 'd', 'e'], R: ['a'] }));
  assert.equal(row.completed, 5);
  assert.equal(row.remaining, 2);
  assert.equal(row.bestLane, 'C');
  assert.equal(row.bestLaneLabel, 'まん中の道');
  assert.equal(row.state, 'racing');
  assert.equal(row.badgeText, 'あと2枚');
  assert.equal(row.detailText, 'まん中の道 5/7枚');
});

test('数え方: 公開用の写し（枚数の数字）でも同じ結果になる', () => {
  assert.deepEqual(readRemainingLaneLengths({ lanes: { L: 1, C: 6, R: 0 } }), { L: 1, C: 6, R: 0 });
  const row = projectPlayerRemaining(player('P2', { L: 1, C: 6, R: 0 }));
  assert.equal(row.remaining, 1);
  assert.equal(row.state, 'reach');
  assert.equal(row.badgeText, 'あと1枚');
});

test('あと1枚はリーチ、7枚そろうと門が開いた（勝ちとは言わない）', () => {
  const reach = projectPlayerRemaining(player('P1', { L: [], C: ['1', '2', '3', '4', '5', '6'], R: [] }));
  assert.equal(reach.state, 'reach');
  const open = projectPlayerRemaining(player('P1', { L: [], C: ['1', '2', '3', '4', '5', '6', '7'], R: [] }));
  assert.equal(open.remaining, 0);
  assert.equal(open.state, 'gate_open');
  assert.equal(open.badgeText, '門が開いた！');
  assert.match(open.ariaText, /門が開いた/);
  assert.doesNotMatch(open.badgeText, /勝ち|勝利/);
});

test('全員分: 先頭（残り最小）を出し、開始直後は先頭を付けない', () => {
  const start = projectRemainingToSeven({
    players: [
      player('P1', { L: [], C: [], R: [] }),
      player('P2', { L: [], C: [], R: [] }),
      player('P3', { L: [], C: [], R: [] }),
      player('P4', { L: [], C: [], R: [] }),
    ],
  });
  assert.equal(start.hasData, true);
  assert.deepEqual(start.leaderIds, []);
  assert.equal(start.minRemaining, 7);

  const mid = projectRemainingToSeven({
    players: [
      player('P1', { L: ['a'], C: [], R: [] }),
      player('P2', { L: [], C: ['a', 'b', 'c', 'd'], R: [] }),
      player('P3', { L: [], C: [], R: ['a', 'b'] }),
      player('P4', { L: [], C: ['a', 'b', 'c', 'd'], R: [] }),
    ],
  });
  assert.deepEqual(mid.leaderIds, ['P2', 'P4']);
  assert.equal(mid.players[1].isLeader, true);
  assert.equal(mid.players[0].isLeader, false);
  assert.deepEqual(mid.gateOpenIds, []);
});

test('門が開いた人が gateOpenIds に入る', () => {
  const model = projectRemainingToSeven({
    players: [
      player('P1', { L: ['1', '2', '3', '4', '5', '6', '7'], C: [], R: [] }),
      player('P2', { L: [], C: [], R: [] }),
    ],
  });
  assert.deepEqual(model.gateOpenIds, ['P1']);
});

test('おかしい入力は断る。道が無い人は残り7', () => {
  assert.throws(() => projectPlayerRemaining(null), /REMAINING_PLAYER_REQUIRED/);
  assert.throws(() => projectPlayerRemaining({ name: 'x' }), /REMAINING_PLAYER_ID_REQUIRED/);
  assert.throws(() => projectRemainingToSeven({ players: null }), /REMAINING_PLAYERS_REQUIRED/);
  const noLanes = projectPlayerRemaining({ id: 'P9', name: 'x' });
  assert.equal(noLanes.remaining, 7);
  assert.equal(noLanes.completed, 0);
});

test('7枚を超える道でも残りは0で止まる', () => {
  const row = projectPlayerRemaining(player('P1', { L: ['1', '2', '3', '4', '5', '6', '7', '8'], C: [], R: [] }));
  assert.equal(row.completedRaw, 8);
  assert.equal(row.completed, 7);
  assert.equal(row.remaining, 0);
});
