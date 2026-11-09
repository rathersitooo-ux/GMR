// 夜の闘技場の残りの演出（33番）の画面への取り付け。
// 33番の核（battle-night-arena-remaining-effects-core.mjs）が決めた4つの演出のうち、
// DOM・CSSで出す2つ（光る模様・中央のTURNの丸い飾り）をここでつなぐ。
// 金のふちのマスは盤面の描画（GAMEROAD.html の renderField3D）に直接入れてある。
// じゃんけんの枠の青い炎は BATTLE START の表示（battle-start-presentation-runtime.mjs）に入れてある。
// 表示専用。対戦の状態・勝敗・門の判定は変えない。
// 動きを減らす設定では、光る模様は光らせず、丸い飾りは回さない（33番の核の決まり）。
import {
  NIGHT_ARENA_REMAINING_EFFECTS,
  auditNightArenaRemainingEffects,
  decideNightArenaRemainingEffects,
} from './battle-night-arena-remaining-effects-core.mjs';

export const NIGHT_ARENA_EFFECTS_MOUNT_SCHEMA = 'gameroad.battle-night-arena-effects-mount.v1';

const STYLE_ID = 'gameroad-battle-night-arena-effects-style';
const PATTERN_CLASS = 'nightArenaPattern';
const POLL_MS = 400;
const MAX_TICKS = 50;

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
}

function isElement(value) {
  return !!value && typeof value.appendChild === 'function' && typeof value.setAttribute === 'function';
}

function addStyle(document) {
  if (typeof document.getElementById === 'function' && document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
/* 光る模様：盤面の上に薄い模様を重ねる。文字と手札の数字の読みやすさを落とさないよう薄くする。 */
.${PATTERN_CLASS}{position:absolute;inset:0;z-index:1;pointer-events:none;opacity:.45;background:radial-gradient(circle at 22% 28%,rgba(139,123,255,.16),transparent 32%),radial-gradient(circle at 78% 72%,rgba(255,215,77,.11),transparent 30%),repeating-linear-gradient(45deg,rgba(139,123,255,.055) 0 2px,transparent 2px 26px),repeating-linear-gradient(-45deg,rgba(139,123,255,.055) 0 2px,transparent 2px 26px);animation:nightArenaPatternGlow 6s ease-in-out infinite alternate}
@keyframes nightArenaPatternGlow{from{opacity:.32}to{opacity:.55}}
.${PATTERN_CLASS}[data-animate="false"]{animation:none;opacity:.22}
/* 中央のTURNの丸い飾り：巡の数字の周りに丸い飾り。TURNの文字と順番の表示は変えない。 */
.battlePhaseHeader[data-effect="turn-round-decoration"] #battlePhaseRound{position:relative}
.battlePhaseHeader[data-effect="turn-round-decoration"] #battlePhaseRound::after{content:"";position:absolute;left:50%;top:50%;width:74px;height:74px;margin:-37px 0 0 -37px;border-radius:50%;border:2px dashed rgba(255,215,77,.6);pointer-events:none;animation:nightArenaTurnRing 24s linear infinite}
@keyframes nightArenaTurnRing{from{transform:rotate(0)}to{transform:rotate(360deg)}}
.battlePhaseHeader[data-effect="turn-round-decoration"][data-animate="false"] #battlePhaseRound::after{animation:none;border-style:solid}
@media(prefers-reduced-motion:reduce){.${PATTERN_CLASS}{animation:none;opacity:.22}.battlePhaseHeader[data-effect="turn-round-decoration"] #battlePhaseRound::after{animation:none;border-style:solid}}
body.reduceMotion .${PATTERN_CLASS},body.lowPerf .${PATTERN_CLASS}{animation:none;opacity:.22}
body.reduceMotion .battlePhaseHeader[data-effect="turn-round-decoration"] #battlePhaseRound::after,body.lowPerf .battlePhaseHeader[data-effect="turn-round-decoration"] #battlePhaseRound::after{animation:none;border-style:solid}
`;
  document.head?.appendChild?.(style);
}

export function createNightArenaRemainingEffectsMount({
  getBattleMap = null,
  getPhaseHeader = null,
  getSettings = null,
} = {}) {
  if (typeof getBattleMap !== 'function') throw new TypeError('NIGHT_ARENA_GET_BATTLE_MAP_REQUIRED');
  if (typeof getPhaseHeader !== 'function') throw new TypeError('NIGHT_ARENA_GET_PHASE_HEADER_REQUIRED');
  if (typeof getSettings !== 'function') throw new TypeError('NIGHT_ARENA_GET_SETTINGS_REQUIRED');

  let timerId = null;
  let ticks = 0;
  let mounted = false;
  let lastDecided = null;

  function readReducedMotion() {
    try {
      const settings = getSettings() || {};
      return settings.reducedMotion === true;
    } catch {
      return false;
    }
  }

  function mountOnce() {
    const decided = decideNightArenaRemainingEffects({ reducedMotion: readReducedMotion() });
    lastDecided = decided;
    const byId = (id) => decided.find((effect) => effect.id === id);
    const battleMap = getBattleMap();
    const header = getPhaseHeader();
    const document = battleMap?.ownerDocument ?? header?.ownerDocument ?? null;
    if (document) addStyle(document);
    // 光る模様：盤面（#battleMap）の上に、薄い模様の重ねを1枚だけ入れる。
    // 描画のすぐ後ろ（生きた盤面の表示より手前）に入れ、押せないものにする。
    let patternDone = false;
    if (isElement(battleMap) && document) {
      if (!battleMap.querySelector?.(`.${PATTERN_CLASS}`)) {
        const pattern = document.createElement('div');
        pattern.className = PATTERN_CLASS;
        pattern.setAttribute('data-effect', 'glowing-pattern');
        pattern.setAttribute('data-animate', String(byId('glowing-pattern')?.animate !== false));
        pattern.setAttribute('aria-hidden', 'true');
        const canvas = battleMap.querySelector?.('#fieldCanvas');
        if (canvas?.nextSibling) battleMap.insertBefore(pattern, canvas.nextSibling);
        else battleMap.appendChild(pattern);
      }
      patternDone = !!battleMap.querySelector?.(`.${PATTERN_CLASS}`);
    }
    // 中央のTURNの丸い飾り：TURNの表示の巡の数字の周りに丸い飾り。
    // 飾りは CSS だけで出し、TURNの文字と順番の表示は変えない。
    let headerDone = false;
    if (isElement(header)) {
      if (header.getAttribute?.('data-effect') !== 'turn-round-decoration') {
        header.setAttribute('data-effect', 'turn-round-decoration');
        header.setAttribute('data-animate', String(byId('turn-round-decoration')?.animate !== false));
      }
      headerDone = header.getAttribute?.('data-effect') === 'turn-round-decoration';
    }
    if (patternDone && headerDone) {
      mounted = true;
      stop();
    }
    return mounted;
  }

  function start() {
    if (timerId !== null) return;
    const tick = () => {
      ticks += 1;
      try {
        mountOnce();
      } catch { /* 取り付けに失敗しても対戦は止めない */ }
      if (mounted || ticks >= MAX_TICKS) stop();
    };
    tick();
    if (!mounted) {
      const setIntervalFn = globalThis.setInterval ?? ((fn, ms) => globalThis.setTimeout(fn, ms));
      timerId = setIntervalFn(tick, POLL_MS);
    }
  }

  function stop() {
    if (timerId !== null) {
      try {
        (globalThis.clearInterval ?? globalThis.clearTimeout)?.(timerId);
      } catch { /* なし */ }
      timerId = null;
    }
  }

  function snapshot() {
    return freeze({
      schema: NIGHT_ARENA_EFFECTS_MOUNT_SCHEMA,
      mounted,
      effects: (lastDecided ?? []).map((effect) => ({ id: effect.id, enabled: effect.enabled, animate: effect.animate })),
      audit: auditNightArenaRemainingEffects(lastDecided ?? []),
      effectIds: NIGHT_ARENA_REMAINING_EFFECTS.map((effect) => effect.id),
    });
  }

  return freeze({
    schema: NIGHT_ARENA_EFFECTS_MOUNT_SCHEMA,
    start,
    stop,
    snapshot,
  });
}

export const NIGHT_ARENA_EFFECTS_MOUNT = freeze({
  schema: NIGHT_ARENA_EFFECTS_MOUNT_SCHEMA,
  effectIds: NIGHT_ARENA_REMAINING_EFFECTS.map((effect) => effect.id),
  presentationOnly: true,
  gameplayAuthority: false,
  gameStateWrite: false,
});
