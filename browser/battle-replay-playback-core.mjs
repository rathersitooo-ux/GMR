// リプレイの1手ずつの再生（F1-047：見返す画面を一覧から再生へ進める段）
//
// 役割は再生の状態だけ。画面の描き直し（#resultReplay）とタイマーは持たない。
// 消費側は readReplay() で出した出来事の列を state.position 件だけ見せる。
// position は「見せている出来事の数」（0＝まだ何も見せていない、
// totalEvents＝最後まで見せた）。手札の切り替えは決め待ち③のため、ここには入れない。

const REPLAY_PLAYBACK_SCHEMA = 'GAMEROAD_BATTLE_REPLAY_PLAYBACK_V1';
const PLAYBACK_SPEEDS = Object.freeze([0.5, 1, 2, 4]);
const DEFAULT_SPEED = 1;

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function cloneState(state) {
  return { ...state };
}

function assertPlaybackState(state) {
  if (!state ||
      typeof state !== 'object' ||
      Array.isArray(state) ||
      state.schema !== REPLAY_PLAYBACK_SCHEMA ||
      !nonEmptyString(state.matchId) ||
      !Number.isSafeInteger(state.totalEvents) ||
      state.totalEvents < 0 ||
      !Number.isSafeInteger(state.position) ||
      state.position < 0 ||
      state.position > state.totalEvents ||
      typeof state.playing !== 'boolean' ||
      !PLAYBACK_SPEEDS.includes(state.speed)) {
    throw new TypeError('PLAYBACK_STATE_INVALID');
  }
  return state;
}

function freezeState(state) {
  return Object.freeze(cloneState(state));
}

export function createReplayPlayback({ matchId, totalEvents, speed = DEFAULT_SPEED }) {
  if (!nonEmptyString(matchId)) throw new TypeError('PLAYBACK_MATCH_ID_REQUIRED');
  if (!Number.isSafeInteger(totalEvents) || totalEvents < 0) {
    throw new TypeError('PLAYBACK_TOTAL_EVENTS_INVALID');
  }
  if (!PLAYBACK_SPEEDS.includes(speed)) throw new TypeError('PLAYBACK_SPEED_INVALID');
  return freezeState({
    schema: REPLAY_PLAYBACK_SCHEMA,
    matchId,
    totalEvents,
    position: 0,
    playing: false,
    speed
  });
}

export function playReplayPlayback(state) {
  assertPlaybackState(state);
  if (state.position >= state.totalEvents) return state;
  return freezeState({ ...state, playing: true });
}

export function pauseReplayPlayback(state) {
  assertPlaybackState(state);
  if (!state.playing) return state;
  return freezeState({ ...state, playing: false });
}

export function stepReplayPlaybackForward(state) {
  assertPlaybackState(state);
  if (state.position >= state.totalEvents) {
    return state.playing ? freezeState({ ...state, playing: false }) : state;
  }
  const position = state.position + 1;
  const playing = position >= state.totalEvents ? false : state.playing;
  return freezeState({ ...state, position, playing });
}

export function stepReplayPlaybackBack(state) {
  assertPlaybackState(state);
  if (state.position <= 0) return state;
  return freezeState({ ...state, position: state.position - 1 });
}

export function setReplayPlaybackSpeed(state, speed) {
  assertPlaybackState(state);
  if (!PLAYBACK_SPEEDS.includes(speed)) throw new TypeError('PLAYBACK_SPEED_INVALID');
  if (state.speed === speed) return state;
  return freezeState({ ...state, speed });
}

export const BATTLE_REPLAY_PLAYBACK = Object.freeze({
  schema: REPLAY_PLAYBACK_SCHEMA,
  speeds: PLAYBACK_SPEEDS,
  defaultSpeed: DEFAULT_SPEED
});
