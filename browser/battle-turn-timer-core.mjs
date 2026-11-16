// 対戦タイマーの核。シャドウバース ワールズビヨンド（SVWB）の対戦タイマーの
// 実数を、GAMEROADの1巡（全員が1回ずつ動く単位）の制限時間として使う。
//
// 出どころ（2026-11-13、モカが実物を開いて確認）：
// - dump-candidates/shadowverse-wb/data/exports/master-data/Jpn/BattleTimeSetting.json
//   （47件、全件を SVWB_BATTLE_TIME_SETTING_MS にそのまま写した）
// - dump-candidates/shadowverse-wb/data/exports/master-data/Jpn/BattleCountSetting.json
//   （2件。エモートとスタンプの1ターン上限で、タイマーではないのでここでは記録だけ）
// - 点検記録：goals/gameroad/hidden_files/settings-implementation-check-20261113.md
//
// GAMEROADへの当て方（この核で使う分）：
// - 通常の1巡の制限時間 = TurnTimeLong 75000（75秒）
// - 警告の出る残り時間 = TurnTimeWarn 15000（残り15秒以下で警告の見た目）
// - 時間切れした次の巡の制限時間 = TurnTimePenalty 20000（20秒）
// - TurnTimeShort 60000 は「短い方のターン時間」として定数に残すが、
//   SVWB側で長短が切り替わる条件はマスター表だけでは確定できないため、
//   この実装では巡の長さの選択には使わない（未確定として記録）。
// - MulliganTime 34000 は引き直しの時間。GAMEROADの現在の流れに引き直しの
//   段が無いため使わない。EvolveExpandTurnTime 4000 は進化で延びる時間で、
//   GAMEROADに進化の操作が無いため使わない。BattleTimeoutContestantVsPlayer
//   100000 は対戦全体の打ち切り側の値で、巡ごとのタイマーには使わない。
//   Shortish系・TrainingMatch系は別形式の対戦用で使わない。
//
// ここは表示と数え下げ専用の純粋な核で、対戦の状態・勝敗は変えない。
// 時間切れの時に何が起きるか（自動でターンが終わる等）は未実装のまま：
// 既存の決めでは「時間切れの自動行動は、パートナーの既定の作戦が未決のため
// 入っていない」（files/GAMEROAD-版権キャラ-ゲーム側の置き場所と制限時間
// -20261110.md）。この核は0秒で「時間切れ」の表示状態を返すだけで、
// 対戦の進行には一切触らない（仮置き。決めが出たら進行側へつなぐ）。

export const BATTLE_TURN_TIMER_SCHEMA = 'gameroad.battle-turn-timer.v1';

export const SVWB_BATTLE_TIME_SETTING_MS = Object.freeze({
  ActionRetryDelay: 1000,
  ActionRetryWhile: 5000,
  AdviceAutoStepDuration: 5000,
  AdviceRetryTime: 3000,
  AfterRollback: 500,
  BattleContextEraseTime: 120000,
  BattleStampInterval: 3000,
  BattleTimeoutContestantVsAI: 28800000,
  BattleTimeoutContestantVsPlayer: 100000,
  BattleTimeoutWatcher: 25000,
  ConnectTimeout: 15000,
  DisconnectWait: 90000,
  DisplayLoadingWait: 600,
  EudieWishMessageMaxTime: 8000,
  EudieWishMessageMinTime: 2000,
  EvolveExpandTurnTime: 4000,
  FestivalDecisiveBattleAutoStampIntervalMax: 1000,
  FestivalDecisiveBattleAutoStampIntervalMin: 300,
  ForcedExitResultTime: 30000,
  HeartBeatInterval: 1000,
  HeartBeatTimeout: 3000,
  MulliganReadyWait: 15000,
  MulliganTime: 34000,
  OpeningAdviceDuration: 3000,
  PuzzleConnectionTimeout: 30000,
  PuzzleContextDeleteTime: 86400000,
  PuzzleContextEraseDelay: 60000,
  PuzzleStartWaitTime: 1000,
  RematchWait: 15000,
  RollbackWait: 500,
  ShortishMulliganTime: 34000,
  ShortishTurnTimeLong: 30000,
  ShortishTurnTimePenalty: 20000,
  ShortishTurnTimeShort: 30000,
  ShortishTurnTimeWarn: 10000,
  TimeoutBothLose: 86400000,
  TimeoutBothLoseForLobbySpecialBattle: 1800000,
  TrainingMatchMulliganTime: 64000,
  TrainingMatchTurnTimeLong: 150000,
  TrainingMatchTurnTimePenalty: 20000,
  TrainingMatchTurnTimeShort: 120000,
  TrainingMatchTurnTimeWarn: 30000,
  TurnTimeLong: 75000,
  TurnTimePenalty: 20000,
  TurnTimeShort: 60000,
  TurnTimeWarn: 15000,
  TurnTimerStartLimit: 60000,
});

export const SVWB_BATTLE_COUNT_SETTING = Object.freeze({
  EmoteLimitPerTurn: 3,
  StampLimitPerTurn: 10,
});

/** GAMEROADの対戦タイマーが実際に使う値（全部SVWBの実数の写し）。 */
export const BATTLE_TURN_TIMER_CONFIG = Object.freeze({
  turnTimeLongMs: SVWB_BATTLE_TIME_SETTING_MS.TurnTimeLong,
  turnTimeShortMs: SVWB_BATTLE_TIME_SETTING_MS.TurnTimeShort,
  turnTimeWarnMs: SVWB_BATTLE_TIME_SETTING_MS.TurnTimeWarn,
  turnTimePenaltyMs: SVWB_BATTLE_TIME_SETTING_MS.TurnTimePenalty,
  mulliganTimeMs: SVWB_BATTLE_TIME_SETTING_MS.MulliganTime,
  evolveExpandTurnTimeMs: SVWB_BATTLE_TIME_SETTING_MS.EvolveExpandTurnTime,
  battleTimeoutVsPlayerMs: SVWB_BATTLE_TIME_SETTING_MS.BattleTimeoutContestantVsPlayer,
  timerStartLimitMs: SVWB_BATTLE_TIME_SETTING_MS.TurnTimerStartLimit,
});

export const TURN_TIMER_STATES = Object.freeze({
  RUNNING: 'running',
  WARNING: 'warning',
  EXPIRED: 'expired',
});

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
}

function requireFiniteMs(value, name) {
  if (!Number.isFinite(value)) throw new TypeError(`TURN_TIMER_${name}_FINITE_MS_REQUIRED`);
  return value;
}

/**
 * その巡の制限時間を返す。前の巡が時間切れだったら TurnTimePenalty、
 * それ以外は TurnTimeLong。TurnTimeShort の長短の切り替え条件は
 * SVWB側で未確定のため、ここでは選ばない。
 */
export function turnDurationMs({ previousRoundExpired = false, config = BATTLE_TURN_TIMER_CONFIG } = {}) {
  return previousRoundExpired ? config.turnTimePenaltyMs : config.turnTimeLongMs;
}

/** タイマーの状態（核の内部用。画面側はこの形を直接持たない）。 */
export function createTurnTimerState() {
  return {
    round: null,
    startedAtMs: null,
    durationMs: 0,
    lastRoundExpired: false,
  };
}

/** 新しい巡のタイマーを始める。前の巡の時間切れの記録は呼び出し側が finish で残す。 */
export function startTurnTimerRound(state, { round, nowMs, durationMs } = {}) {
  if (!state || typeof state !== 'object') throw new TypeError('TURN_TIMER_STATE_REQUIRED');
  if (!Number.isSafeInteger(round) || round < 0) throw new TypeError('TURN_TIMER_ROUND_REQUIRED');
  requireFiniteMs(nowMs, 'NOW');
  const duration = durationMs === undefined
    ? turnDurationMs({ previousRoundExpired: state.lastRoundExpired === true })
    : durationMs;
  if (!Number.isFinite(duration) || duration <= 0) throw new TypeError('TURN_TIMER_DURATION_POSITIVE_MS_REQUIRED');
  state.round = round;
  state.startedAtMs = nowMs;
  state.durationMs = duration;
  return projectTurnTimer(state, nowMs);
}

/** 今の残り時間を返す。0未満にはならず、0で「時間切れ」の状態になるだけ（進行は変えない）。 */
export function projectTurnTimer(state, nowMs, { config = BATTLE_TURN_TIMER_CONFIG } = {}) {
  if (!state || typeof state !== 'object' || state.round === null || state.startedAtMs === null) {
    return freeze({
      schema: BATTLE_TURN_TIMER_SCHEMA,
      active: false,
      round: null,
      durationMs: 0,
      elapsedMs: 0,
      remainingMs: 0,
      remainingSeconds: 0,
      ratio: 0,
      state: TURN_TIMER_STATES.EXPIRED,
      expired: false,
      presentationOnly: true,
      gameplayAuthority: false,
      gameStateWrite: false,
    });
  }
  requireFiniteMs(nowMs, 'NOW');
  const elapsedMs = Math.max(0, nowMs - state.startedAtMs);
  const remainingMs = Math.max(0, state.durationMs - elapsedMs);
  const expired = remainingMs <= 0;
  const timerState = expired
    ? TURN_TIMER_STATES.EXPIRED
    : remainingMs <= config.turnTimeWarnMs
      ? TURN_TIMER_STATES.WARNING
      : TURN_TIMER_STATES.RUNNING;
  return freeze({
    schema: BATTLE_TURN_TIMER_SCHEMA,
    active: true,
    round: state.round,
    durationMs: state.durationMs,
    elapsedMs,
    remainingMs,
    remainingSeconds: Math.ceil(remainingMs / 1000),
    ratio: state.durationMs > 0 ? remainingMs / state.durationMs : 0,
    state: timerState,
    expired,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
  });
}

/**
 * 巡が終わる（次の巡へ移る）時に、その巡が時間切れだったかを記録する。
 * 次の巡の長さ（turnDurationMs の previousRoundExpired）に効くのはここだけ。
 */
export function finishTurnTimerRound(state, nowMs) {
  const projection = projectTurnTimer(state, nowMs);
  if (!projection.active) return freeze({ round: null, expired: false });
  state.lastRoundExpired = projection.expired;
  return freeze({ round: projection.round, expired: projection.expired });
}

export const BATTLE_TURN_TIMER_CORE = freeze({
  schema: BATTLE_TURN_TIMER_SCHEMA,
  source: 'shadowverse-worlds-beyond/master-data/Jpn/BattleTimeSetting.json',
  sourceEntryCount: Object.keys(SVWB_BATTLE_TIME_SETTING_MS).length,
  countSettingSource: 'shadowverse-worlds-beyond/master-data/Jpn/BattleCountSetting.json',
  durationRule: 'previous round expired -> TurnTimePenalty, else TurnTimeLong',
  warningRule: 'remaining <= TurnTimeWarn and remaining > 0',
  timeoutAction: 'none (display only; partner default strategy undecided)',
  presentationOnly: true,
  gameplayAuthority: false,
  gameStateWrite: false,
});
