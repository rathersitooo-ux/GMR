import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BATTLE_REPLAY_PLAYBACK,
  createReplayPlayback,
  pauseReplayPlayback,
  playReplayPlayback,
  setReplayPlaybackSpeed,
  stepReplayPlaybackBack,
  stepReplayPlaybackForward
} from '../browser/battle-replay-playback-core.mjs';

function playback(totalEvents = 3, extra = {}) {
  return createReplayPlayback({ matchId: 'M-TEST-1', totalEvents, ...extra });
}

test('作った直後は0手目で止まっている', () => {
  const state = playback(3);
  assert.equal(state.position, 0);
  assert.equal(state.playing, false);
  assert.equal(state.speed, 1);
  assert.equal(state.totalEvents, 3);
  assert.equal(Object.isFrozen(state), true);
});

test('速さは作る時に選べる', () => {
  assert.equal(playback(3, { speed: 2 }).speed, 2);
  assert.equal(playback(3, { speed: 4 }).speed, 4);
  assert.equal(playback(3, { speed: 0.5 }).speed, 0.5);
  assert.throws(() => playback(3, { speed: 3 }), /PLAYBACK_SPEED_INVALID/);
  assert.throws(() => playback(3, { speed: 0 }), /PLAYBACK_SPEED_INVALID/);
});

test('1手進むと見せる出来事が1件増える', () => {
  const next = stepReplayPlaybackForward(playback(3));
  assert.equal(next.position, 1);
  assert.equal(next.playing, false);
});

test('最後まで進むと止まる', () => {
  let state = playback(2);
  state = playReplayPlayback(state);
  assert.equal(state.playing, true);
  state = stepReplayPlaybackForward(state);
  assert.equal(state.position, 1);
  assert.equal(state.playing, true);
  state = stepReplayPlaybackForward(state);
  assert.equal(state.position, 2);
  assert.equal(state.playing, false);
});

test('最後ではそれ以上進まない', () => {
  let state = playback(1);
  state = stepReplayPlaybackForward(state);
  const same = stepReplayPlaybackForward(state);
  assert.equal(same, state);
  assert.equal(same.position, 1);
});

test('1手戻ると見せる出来事が1件減る', () => {
  let state = playback(3);
  state = stepReplayPlaybackForward(state);
  state = stepReplayPlaybackForward(state);
  assert.equal(state.position, 2);
  state = stepReplayPlaybackBack(state);
  assert.equal(state.position, 1);
});

test('0手目ではそれ以上戻らない', () => {
  const state = playback(3);
  assert.equal(stepReplayPlaybackBack(state), state);
});

test('再生は最後まで行ったら始まらない', () => {
  let state = playback(1);
  state = stepReplayPlaybackForward(state);
  assert.equal(playReplayPlayback(state), state);
  assert.equal(playReplayPlayback(state).playing, false);
});

test('止めると再生が止まる', () => {
  let state = playback(3);
  state = playReplayPlayback(state);
  assert.equal(state.playing, true);
  state = pauseReplayPlayback(state);
  assert.equal(state.playing, false);
  assert.equal(pauseReplayPlayback(state), state);
});

test('速さを途中で変えられる', () => {
  const state = playback(3);
  const faster = setReplayPlaybackSpeed(state, 2);
  assert.equal(faster.speed, 2);
  assert.equal(faster.position, state.position);
  assert.equal(setReplayPlaybackSpeed(state, 1), state);
  assert.throws(() => setReplayPlaybackSpeed(state, 3), /PLAYBACK_SPEED_INVALID/);
});

test('元の状態は変わらない', () => {
  const state = playback(3);
  const next = stepReplayPlaybackForward(state);
  assert.notEqual(next, state);
  assert.equal(state.position, 0);
  assert.equal(Object.isFrozen(state), true);
});

test('出来事が0件のリプレイも作れる', () => {
  const state = playback(0);
  assert.equal(state.totalEvents, 0);
  assert.equal(playReplayPlayback(state), state);
  assert.equal(stepReplayPlaybackForward(state), state);
});

test('作る時の値がおかしいと作れない', () => {
  assert.throws(() => createReplayPlayback({ matchId: '', totalEvents: 3 }), /PLAYBACK_MATCH_ID_REQUIRED/);
  assert.throws(() => createReplayPlayback({ matchId: 'M-1', totalEvents: -1 }), /PLAYBACK_TOTAL_EVENTS_INVALID/);
  assert.throws(() => createReplayPlayback({ matchId: 'M-1', totalEvents: 1.5 }), /PLAYBACK_TOTAL_EVENTS_INVALID/);
});

test('速さの決まりは外から読める', () => {
  assert.deepEqual([...BATTLE_REPLAY_PLAYBACK.speeds], [0.5, 1, 2, 4]);
  assert.equal(BATTLE_REPLAY_PLAYBACK.defaultSpeed, 1);
});
