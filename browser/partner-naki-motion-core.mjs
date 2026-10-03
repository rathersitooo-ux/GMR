import {
  NAKI_CURRENT_VISUAL_ASSETS,
  applySpriteFrame,
} from './naki-current-visual-assets.mjs';

const PROFILES = Object.freeze({
  IDLE: Object.freeze({ frames: Object.freeze([0, 1, 2, 1, 0, 3]), intervalMs: 420, loop: true }),
  SPEAK: Object.freeze({ frames: Object.freeze([4, 5, 6, 7, 6, 5]), intervalMs: 145, loop: true }),
  REACTION: Object.freeze({ frames: Object.freeze([8, 9, 10, 11]), intervalMs: 120, loop: false, returnState: 'IDLE' }),
});

export const NAKI_ADVICE_MOTION_STATES = Object.freeze(Object.keys(PROFILES));
export const NAKI_ADVICE_MOTION_PROFILES = PROFILES;

function profileFor(state) {
  return Object.hasOwn(PROFILES, state) ? PROFILES[state] : PROFILES.IDLE;
}

export function createNakiAdviceMotionController({
  globalRef = globalThis,
  bustup,
  reducedMotion = null,
} = {}) {
  if (!bustup?.figure || !bustup?.sprite) return null;
  const schedule = globalRef?.setTimeout?.bind(globalRef) ?? globalThis.setTimeout?.bind(globalThis) ?? null;
  const cancel = globalRef?.clearTimeout?.bind(globalRef) ?? globalThis.clearTimeout?.bind(globalThis) ?? null;
  const shouldReduce = reducedMotion ?? Boolean(globalRef?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  let timer = null;
  let active = true;
  let state = null;
  let serial = 0;

  const clearTimer = () => {
    if (timer != null && cancel) {
      try { cancel(timer); } catch {}
    }
    timer = null;
  };

  const showFrame = (frame) => applySpriteFrame(bustup.sprite, {
    src: NAKI_CURRENT_VISUAL_ASSETS.advice.atlas,
    columns: NAKI_CURRENT_VISUAL_ASSETS.advice.columns,
    rows: NAKI_CURRENT_VISUAL_ASSETS.advice.rows,
    frameIndex: frame,
  });

  const setState = (nextState = 'IDLE', { restart = false } = {}) => {
    if (!active) return null;
    const resolvedState = Object.hasOwn(PROFILES, nextState) ? nextState : 'IDLE';
    if (!restart && state === resolvedState) return profileFor(resolvedState);
    clearTimer();
    state = resolvedState;
    serial += 1;
    const token = serial;
    const profile = profileFor(state);
    bustup.figure.dataset.motionState = state;
    bustup.figure.dataset.motionSource = 'naki-current-12-frame';
    if (shouldReduce || !schedule) {
      showFrame(profile.frames[0] ?? NAKI_CURRENT_VISUAL_ASSETS.advice.reducedMotionFrame);
      return profile;
    }
    let index = 0;
    const tick = () => {
      if (!active || token !== serial || bustup.figure.hidden) return;
      showFrame(profile.frames[index]);
      index += 1;
      if (index >= profile.frames.length) {
        if (profile.loop) index = 0;
        else if (profile.returnState) {
          setState(profile.returnState);
          return;
        } else {
          index = profile.frames.length - 1;
          return;
        }
      }
      timer = schedule(tick, profile.intervalMs);
    };
    tick();
    return profile;
  };

  const clear = () => {
    clearTimer();
    serial += 1;
    state = null;
    delete bustup.figure.dataset.motionState;
    delete bustup.figure.dataset.motionSource;
    showFrame(NAKI_CURRENT_VISUAL_ASSETS.advice.reducedMotionFrame);
  };

  const destroy = () => {
    if (!active) return false;
    active = false;
    clear();
    return true;
  };

  return Object.freeze({
    setState,
    clear,
    destroy,
    snapshot: () => Object.freeze({ state, reducedMotion: Boolean(shouldReduce), serial }),
  });
}

export const NAKI_ADVICE_MOTION_RUNTIME = Object.freeze({
  schema: 'gameroad.partner-naki-advice-motion.v1',
  source: 'NAKI_12_FRAME_CURRENT_BUSTUP',
  visualChange: 'AUTHORED_FRAME_ANIMATION_NOT_WHOLE_IMAGE_BOB',
  presentationOnly: true,
  gameplayAuthority: false,
  reducedMotion: 'FIRST_FRAME_PER_STATE',
});
