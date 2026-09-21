import {
  NAKI_IDOL_BATTLE_FRAMES,
  resolveNakiVfx
} from './naki-idol-battle-assets.mjs';

export const NAKI_BATTLE_RUNTIME_SCHEMA = 'gameroad.battle.naki-idol-sprite-runtime.v1';
export const NAKI_BATTLE_PHASE_ORDER = Object.freeze([
  'stance',
  'anticipation',
  'release',
  'impact',
  'reaction',
  'return'
]);

const TIMELINE = Object.freeze([
  Object.freeze({ phase: 'stance', duration: 180, attackerFrame: 'stance', defenderFrame: 'stance', vfxPhase: null, hitstop: false }),
  Object.freeze({ phase: 'anticipation', duration: 320, attackerFrame: 'anticipation', defenderFrame: 'stance', vfxPhase: null, hitstop: false }),
  Object.freeze({ phase: 'release', duration: 170, attackerFrame: 'release', defenderFrame: 'stance', vfxPhase: 'release', hitstop: false }),
  Object.freeze({ phase: 'impact', duration: 90, attackerFrame: 'release', defenderFrame: 'hitReaction', vfxPhase: 'impact', hitstop: true }),
  Object.freeze({ phase: 'reaction', duration: 260, attackerFrame: 'hitReaction', defenderFrame: 'hitReaction', vfxPhase: 'reaction', hitstop: false }),
  Object.freeze({ phase: 'return', duration: 360, attackerFrame: 'return', defenderFrame: 'return', vfxPhase: null, hitstop: false })
]);

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}

function normalizedRole(role) {
  return role === 'defender' ? 'defender' : 'attacker';
}

function phaseIndex(phase) {
  const index = NAKI_BATTLE_PHASE_ORDER.indexOf(phase);
  return index < 0 ? 0 : index;
}

export function phaseForPresentationStage(stage, role = 'attacker') {
  const normalizedRoleValue = normalizedRole(role);
  switch (stage) {
    case 'read': return normalizedRoleValue === 'attacker' ? 'anticipation' : 'stance';
    case 'compare': return normalizedRoleValue === 'attacker' ? 'release' : 'stance';
    case 'winner': return normalizedRoleValue === 'attacker' ? 'impact' : 'reaction';
    case 'settle': return 'return';
    case 'reveal':
    case 'focus':
    default: return 'stance';
  }
}

function durationFor(descriptor, reducedMotion) {
  if (!reducedMotion) return descriptor.duration;
  return descriptor.phase === 'impact' ? 40 : 0;
}

export function buildNakiBattleTimeline({ role = 'attacker', seed = 0, reducedMotion = false } = {}) {
  const normalizedRoleValue = normalizedRole(role);
  return freeze(TIMELINE.map((descriptor) => {
    const frameKey = normalizedRoleValue === 'attacker' ? descriptor.attackerFrame : descriptor.defenderFrame;
    return {
      ...descriptor,
      role: normalizedRoleValue,
      duration: durationFor(descriptor, reducedMotion),
      frame: NAKI_IDOL_BATTLE_FRAMES[frameKey],
      vfx: descriptor.vfxPhase
        ? resolveNakiVfx({ phase: descriptor.vfxPhase, seed, role: normalizedRoleValue })
        : null
    };
  }));
}

function clearChildren(node) {
  if (typeof node.replaceChildren === 'function') {
    node.replaceChildren();
    return;
  }
  while (node.firstChild) node.removeChild(node.firstChild);
}

function schedule(globalObject, callback, delay) {
  const setTimer = typeof globalObject?.setTimeout === 'function' ? globalObject.setTimeout.bind(globalObject) : setTimeout;
  return setTimer(callback, Math.max(0, delay));
}

function unschedule(globalObject, timer) {
  const clearTimer = typeof globalObject?.clearTimeout === 'function' ? globalObject.clearTimeout.bind(globalObject) : clearTimeout;
  if (timer != null) clearTimer(timer);
}

export function createNakiBattleSpriteController({
  global = globalThis,
  root,
  role = 'attacker',
  facing = role === 'defender' ? 'left' : 'right',
  seed = 0,
  reducedMotion = false,
  onPhase = null
} = {}) {
  if (!root || typeof root.appendChild !== 'function') throw new TypeError('NAKI_BATTLE_SPRITE_ROOT_REQUIRED');
  const document = root.ownerDocument || global?.document;
  if (!document || typeof document.createElement !== 'function') throw new TypeError('NAKI_BATTLE_SPRITE_DOCUMENT_REQUIRED');

  const normalizedRoleValue = normalizedRole(role);
  const shell = document.createElement('div');
  shell.className = 'nakiBattleSprite';
  shell.dataset.role = normalizedRoleValue;
  shell.dataset.facing = facing === 'left' ? 'left' : 'right';
  shell.dataset.runtimeSchema = NAKI_BATTLE_RUNTIME_SCHEMA;
  const image = document.createElement('img');
  image.className = 'nakiBattleSpriteImage';
  image.alt = '';
  image.decoding = 'async';
  image.draggable = false;
  const vfx = document.createElement('img');
  vfx.className = 'nakiBattleSpriteVfx';
  vfx.alt = '';
  vfx.decoding = 'async';
  vfx.draggable = false;
  vfx.setAttribute('aria-hidden', 'true');
  shell.append(image, vfx);
  clearChildren(root);
  root.appendChild(shell);

  let currentSeed = seed;
  let currentReducedMotion = reducedMotion === true;
  let timeline = buildNakiBattleTimeline({ role: normalizedRoleValue, seed: currentSeed, reducedMotion: currentReducedMotion });
  let timer = null;
  let runId = 0;
  let resolver = null;
  let disposed = false;
  let current = null;

  function renderPhase(phase, overrides = {}) {
    if (disposed) return null;
    const descriptor = timeline.find((item) => item.phase === phase) || timeline[0];
    const frame = descriptor.frame;
    const effect = Object.prototype.hasOwnProperty.call(overrides, 'vfx') ? overrides.vfx : descriptor.vfx;
    shell.dataset.phase = descriptor.phase;
    shell.dataset.frame = frame?.fileName || '';
    shell.dataset.vfx = effect?.fileName || 'none';
    shell.dataset.hitstop = descriptor.hitstop ? 'true' : 'false';
    image.src = frame?.src || '';
    image.dataset.assetFile = frame?.fileName || '';
    if (effect?.src) {
      vfx.src = effect.src;
      vfx.dataset.assetFile = effect.fileName;
      vfx.hidden = false;
    } else {
      vfx.removeAttribute('src');
      delete vfx.dataset.assetFile;
      vfx.hidden = true;
    }
    current = freeze({
      schema: NAKI_BATTLE_RUNTIME_SCHEMA,
      role: normalizedRoleValue,
      facing: shell.dataset.facing,
      phase: descriptor.phase,
      frame: frame?.fileName || null,
      vfx: effect?.fileName || null,
      hitstop: descriptor.hitstop === true,
      duration: descriptor.duration
    });
    if (typeof onPhase === 'function') onPhase(current);
    return current;
  }

  function cancel() {
    runId += 1;
    unschedule(global, timer);
    timer = null;
    if (resolver) {
      const resolve = resolver;
      resolver = null;
      resolve({ completed: false, cancelled: true, phase: current?.phase || null });
    }
  }

  function play(options = {}) {
    if (disposed) return Promise.reject(new Error('NAKI_BATTLE_SPRITE_DISPOSED'));
    cancel();
    if (Object.prototype.hasOwnProperty.call(options, 'seed')) currentSeed = options.seed;
    if (Object.prototype.hasOwnProperty.call(options, 'reducedMotion')) currentReducedMotion = options.reducedMotion === true;
    timeline = buildNakiBattleTimeline({ role: normalizedRoleValue, seed: currentSeed, reducedMotion: currentReducedMotion });
    const start = phaseIndex(options.startPhase || 'stance');
    const activeRun = ++runId;
    return new Promise((resolve) => {
      resolver = resolve;
      let index = start;
      const advance = () => {
        if (disposed || activeRun !== runId) return;
        const descriptor = timeline[index];
        renderPhase(descriptor.phase);
        if (index >= timeline.length - 1) {
          resolver = null;
          resolve({ completed: true, cancelled: false, phase: descriptor.phase });
          return;
        }
        index += 1;
        timer = schedule(global, advance, descriptor.duration);
      };
      advance();
    });
  }

  function dispose() {
    if (disposed) return false;
    cancel();
    disposed = true;
    clearChildren(root);
    return true;
  }

  renderPhase('stance');
  return Object.freeze({
    schema: NAKI_BATTLE_RUNTIME_SCHEMA,
    role: normalizedRoleValue,
    renderPhase,
    play,
    cancel,
    dispose,
    snapshot: () => current
  });
}

