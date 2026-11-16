// 対戦タイマーの画面への取り付け。対戦画面の右上に、残り時間の大きな数字と
// 残量の輪（円の進み具合）を出す。数字と残量の見た目だけで、説明文は出さない。
// 値は battle-turn-timer-core.mjs（シャドバWBの実数）の通り：
// 通常の巡は75秒、残り15秒以下で警告の色、時間切れした次の巡は20秒。
//
// 表示と数え下げ専用。対戦の状態・勝敗・進行は変えない。
// 時間切れになっても対戦は自動では進まない（既存の決めで、時間切れの
// 自動行動はパートナーの既定の作戦が未決のため未実装。今は0秒の表示で
// 止まるのが仮置きの形で、クイック判定タイマーの「expiredで止まる」前例と同じ）。
import {
  BATTLE_TURN_TIMER_CONFIG,
  createTurnTimerState,
  finishTurnTimerRound,
  projectTurnTimer,
  startTurnTimerRound,
  turnDurationMs,
} from './battle-turn-timer-core.mjs';

export const BATTLE_TURN_TIMER_RUNTIME_SCHEMA = 'gameroad.battle-turn-timer-runtime.v1';

const ROOT_ATTR = 'data-battle-turn-timer';
const STYLE_ID = 'gameroad-battle-turn-timer-style';
const POLL_MS = 250;

function isElement(value) {
  return !!value && typeof value.appendChild === 'function' && typeof value.setAttribute === 'function';
}

function addStyle(document) {
  if (typeof document.getElementById === 'function' && document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
[${ROOT_ATTR}="1"]{position:absolute;top:46px;right:12px;z-index:26;display:flex;flex-direction:column;align-items:center;pointer-events:none;font-family:inherit}
[${ROOT_ATTR}="1"] .grTurnDial{display:flex;align-items:center;justify-content:center;width:64px;height:64px;border-radius:50%;background:conic-gradient(#ffd94d var(--gr-turn-angle,360deg),rgba(238,247,234,.18) 0deg);box-shadow:0 6px 18px rgba(0,0,0,.35)}
[${ROOT_ATTR}="1"] .grTurnDialInner{display:flex;align-items:center;justify-content:center;width:50px;height:50px;border-radius:50%;background:rgba(3,20,17,.88);color:#eef7ea}
[${ROOT_ATTR}="1"] .grTurnDialInner b{font-size:26px;font-weight:1000;line-height:1}
[${ROOT_ATTR}="1"][data-state="warning"] .grTurnDial{background:conic-gradient(#ff9c4d var(--gr-turn-angle,360deg),rgba(238,247,234,.18) 0deg)}
[${ROOT_ATTR}="1"][data-state="warning"] .grTurnDialInner{color:#ffb27a}
[${ROOT_ATTR}="1"][data-state="warning"]:not([data-reduced-motion="true"]) .grTurnDial{animation:grTurnPulse 1s ease-in-out infinite}
[${ROOT_ATTR}="1"][data-state="expired"] .grTurnDial{background:conic-gradient(#ff6a55 0deg,rgba(238,247,234,.18) 0deg);opacity:.75}
[${ROOT_ATTR}="1"][data-state="expired"] .grTurnDialInner{color:#ff9c86}
@keyframes grTurnPulse{0%{transform:scale(1)}50%{transform:scale(1.07)}100%{transform:scale(1)}}
@media(max-width:720px){[${ROOT_ATTR}="1"]{top:40px;right:8px}[${ROOT_ATTR}="1"] .grTurnDial{width:50px;height:50px}[${ROOT_ATTR}="1"] .grTurnDialInner{width:39px;height:39px}[${ROOT_ATTR}="1"] .grTurnDialInner b{font-size:20px}}
@media(prefers-reduced-motion:reduce){[${ROOT_ATTR}="1"] .grTurnDial{animation:none}}
`;
  document.head?.appendChild?.(style);
  if (!document.head && document.body) document.body.appendChild(style);
}

function createNode(document, tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function setAngle(node, degrees) {
  const style = node?.style;
  if (style && typeof style.setProperty === 'function') {
    style.setProperty('--gr-turn-angle', `${degrees}deg`);
  }
}

export function createBattleTurnTimerMount({
  getMatch,
  getHost,
  getSettings = () => ({}),
  timers = null,
  now = null,
} = {}) {
  if (typeof getMatch !== 'function') throw new TypeError('TURN_TIMER_GET_MATCH_REQUIRED');
  if (typeof getHost !== 'function') throw new TypeError('TURN_TIMER_GET_HOST_REQUIRED');

  const setIntervalFn = timers?.setInterval ?? ((fn, ms) => globalThis.setInterval(fn, ms));
  const clearIntervalFn = timers?.clearInterval ?? ((id) => globalThis.clearInterval(id));
  const nowFn = typeof now === 'function'
    ? now
    : typeof timers?.now === 'function'
      ? timers.now
      : () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  let root = null;
  let dial = null;
  let numberNode = null;
  let timerState = createTurnTimerState();
  let trackedMatchKey = null;
  let trackedRound = null;
  let lastProjection = null;
  let intervalId = null;
  let destroyed = false;

  function resetTracking() {
    timerState = createTurnTimerState();
    trackedMatchKey = null;
    trackedRound = null;
    lastProjection = null;
  }

  function sync() {
    if (destroyed) return null;
    let match = null;
    try { match = getMatch(); } catch { match = null; }
    let host = null;
    try { host = getHost(); } catch { host = null; }
    const round = match && Number.isSafeInteger(match.round) ? match.round : null;
    if (!match || match.lastResult || round === null || !isElement(host)) {
      if (root) root.hidden = true;
      resetTracking();
      return null;
    }
    const document = host.ownerDocument ?? globalThis.document;
    if (!document || typeof document.createElement !== 'function') return null;

    let settings = {};
    try { settings = getSettings() || {}; } catch { settings = {}; }

    const matchKey = String(match.id ?? '');
    const at = nowFn();
    if (matchKey !== trackedMatchKey || round !== trackedRound) {
      if (trackedRound !== null && timerState.round !== null) {
        finishTurnTimerRound(timerState, at);
      }
      if (matchKey !== trackedMatchKey) {
        timerState = createTurnTimerState();
      }
      startTurnTimerRound(timerState, {
        round,
        nowMs: at,
        durationMs: turnDurationMs({ previousRoundExpired: timerState.lastRoundExpired === true }),
      });
      trackedMatchKey = matchKey;
      trackedRound = round;
    }

    if (!root) {
      addStyle(document);
      root = createNode(document, 'div', 'grBattleTurnTimer');
      root.setAttribute(ROOT_ATTR, '1');
      root.dataset.presentationOnly = 'true';
      root.setAttribute('role', 'timer');
      dial = createNode(document, 'div', 'grTurnDial');
      const inner = createNode(document, 'div', 'grTurnDialInner');
      numberNode = createNode(document, 'b', '', '0');
      inner.appendChild(numberNode);
      dial.appendChild(inner);
      root.appendChild(dial);
      host.appendChild(root);
    }
    root.hidden = false;
    root.setAttribute('data-reduced-motion', settings.reducedMotion === true ? 'true' : 'false');

    const projection = projectTurnTimer(timerState, at, { config: BATTLE_TURN_TIMER_CONFIG });
    lastProjection = projection;
    numberNode.textContent = String(projection.remainingSeconds);
    setAngle(dial, Math.max(0, Math.min(360, projection.ratio * 360)));
    root.setAttribute('data-state', projection.state);
    root.setAttribute('aria-label', `残り時間 ${projection.remainingSeconds}秒`);
    return projection;
  }

  function start() {
    if (intervalId !== null || destroyed) return false;
    sync();
    intervalId = setIntervalFn(() => { sync(); }, POLL_MS);
    return true;
  }

  function destroy() {
    if (destroyed) return false;
    destroyed = true;
    if (intervalId !== null) {
      try { clearIntervalFn(intervalId); } catch { /* なし */ }
      intervalId = null;
    }
    if (root?.parentNode?.removeChild) root.parentNode.removeChild(root);
    root = null;
    dial = null;
    numberNode = null;
    resetTracking();
    return true;
  }

  function snapshot() {
    return lastProjection;
  }

  return { start, sync, destroy, snapshot };
}
