import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BATTLE_TURN_TIMER_CONFIG,
  BATTLE_TURN_TIMER_CORE,
  SVWB_BATTLE_COUNT_SETTING,
  SVWB_BATTLE_TIME_SETTING_MS,
  createTurnTimerState,
  finishTurnTimerRound,
  projectTurnTimer,
  startTurnTimerRound,
  turnDurationMs,
} from '../browser/battle-turn-timer-core.mjs';

test('SVWBの実数が全件写っている（BattleTimeSetting 47件）', () => {
  assert.equal(Object.keys(SVWB_BATTLE_TIME_SETTING_MS).length, 47);
  assert.equal(BATTLE_TURN_TIMER_CORE.sourceEntryCount, 47);
  // 対戦タイマーの要点（出どころ: master-data/Jpn/BattleTimeSetting.json）
  assert.equal(SVWB_BATTLE_TIME_SETTING_MS.TurnTimeLong, 75000);
  assert.equal(SVWB_BATTLE_TIME_SETTING_MS.TurnTimeShort, 60000);
  assert.equal(SVWB_BATTLE_TIME_SETTING_MS.TurnTimeWarn, 15000);
  assert.equal(SVWB_BATTLE_TIME_SETTING_MS.TurnTimePenalty, 20000);
  assert.equal(SVWB_BATTLE_TIME_SETTING_MS.MulliganTime, 34000);
  assert.equal(SVWB_BATTLE_TIME_SETTING_MS.EvolveExpandTurnTime, 4000);
  assert.equal(SVWB_BATTLE_TIME_SETTING_MS.BattleTimeoutContestantVsPlayer, 100000);
  assert.equal(SVWB_BATTLE_TIME_SETTING_MS.TurnTimerStartLimit, 60000);
  assert.equal(SVWB_BATTLE_TIME_SETTING_MS.TrainingMatchTurnTimeLong, 150000);
  assert.equal(SVWB_BATTLE_TIME_SETTING_MS.ShortishTurnTimeLong, 30000);
});

test('BattleCountSetting は2件（タイマーではなく回数の上限）', () => {
  assert.deepEqual({ ...SVWB_BATTLE_COUNT_SETTING }, { EmoteLimitPerTurn: 3, StampLimitPerTurn: 10 });
});

test('使う値の設定がSVWBの実数と一致する', () => {
  assert.equal(BATTLE_TURN_TIMER_CONFIG.turnTimeLongMs, 75000);
  assert.equal(BATTLE_TURN_TIMER_CONFIG.turnTimeShortMs, 60000);
  assert.equal(BATTLE_TURN_TIMER_CONFIG.turnTimeWarnMs, 15000);
  assert.equal(BATTLE_TURN_TIMER_CONFIG.turnTimePenaltyMs, 20000);
  assert.equal(BATTLE_TURN_TIMER_CONFIG.mulliganTimeMs, 34000);
});

test('巡の長さ: 通常は TurnTimeLong、前の巡が時間切れなら TurnTimePenalty', () => {
  assert.equal(turnDurationMs(), 75000);
  assert.equal(turnDurationMs({ previousRoundExpired: false }), 75000);
  assert.equal(turnDurationMs({ previousRoundExpired: true }), 20000);
});

test('数え下げと状態: 75秒から減り、残り15秒で警告、0で時間切れ', () => {
  const state = createTurnTimerState();
  const start = startTurnTimerRound(state, { round: 1, nowMs: 1000 });
  assert.equal(start.remainingMs, 75000);
  assert.equal(start.remainingSeconds, 75);
  assert.equal(start.state, 'running');
  assert.equal(start.ratio, 1);

  const mid = projectTurnTimer(state, 1000 + 30000);
  assert.equal(mid.remainingMs, 45000);
  assert.equal(mid.remainingSeconds, 45);
  assert.equal(mid.state, 'running');

  const warnEdge = projectTurnTimer(state, 1000 + 60000);
  assert.equal(warnEdge.remainingMs, 15000);
  assert.equal(warnEdge.state, 'warning');

  const warn = projectTurnTimer(state, 1000 + 61000);
  assert.equal(warn.remainingMs, 14000);
  assert.equal(warn.state, 'warning');
  assert.equal(warn.expired, false);

  const expired = projectTurnTimer(state, 1000 + 75000);
  assert.equal(expired.remainingMs, 0);
  assert.equal(expired.remainingSeconds, 0);
  assert.equal(expired.state, 'expired');
  assert.equal(expired.expired, true);

  // 0を過ぎても残りはマイナスにならない（表示で止まるだけ）
  const past = projectTurnTimer(state, 1000 + 999999);
  assert.equal(past.remainingMs, 0);
  assert.equal(past.expired, true);
});

test('巡の終わりに時間切れを記録し、次の巡は20秒になる', () => {
  const state = createTurnTimerState();
  startTurnTimerRound(state, { round: 1, nowMs: 0 });
  const done = finishTurnTimerRound(state, 80000);
  assert.deepEqual({ ...done }, { round: 1, expired: true });
  assert.equal(state.lastRoundExpired, true);

  const next = startTurnTimerRound(state, { round: 2, nowMs: 80000 });
  assert.equal(next.durationMs, 20000);
  assert.equal(next.remainingSeconds, 20);
});

test('時間内に終わった巡の次は75秒に戻る', () => {
  const state = createTurnTimerState();
  startTurnTimerRound(state, { round: 1, nowMs: 0 });
  const done = finishTurnTimerRound(state, 30000);
  assert.equal(done.expired, false);
  const next = startTurnTimerRound(state, { round: 2, nowMs: 30000 });
  assert.equal(next.durationMs, 75000);
});

test('始める前は active=false で、対戦の状態は変えない印が付く', () => {
  const state = createTurnTimerState();
  const idle = projectTurnTimer(state, 0);
  assert.equal(idle.active, false);
  assert.equal(idle.gameplayAuthority, false);
  assert.equal(idle.gameStateWrite, false);
  assert.equal(idle.presentationOnly, true);
});
