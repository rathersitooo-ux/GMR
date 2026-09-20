import {
  SAASUNA_BUSTUP_ASSETS,
  resolveSaasunaAdviceBustupState,
} from './partner-saasuna-bustup-visuals.mjs';

const MOTION_STYLE_ID = 'gameroad-partner-advice-saasuna-motion-r1';
const MOTION_EFFECT_ROLE = 'saasuna-motion-effect';
const MOTION_CROSSFADE_ROLE = 'saasuna-motion-crossfade';
const SAASUNA_PARTNER_ID = 'partner.saasuna';

function freezeFrames(frames) {
  return Object.freeze(frames.map((frame) => Object.freeze({ ...frame })));
}

function freezeProfile(profile) {
  return Object.freeze({
    ...profile,
    keyframes: freezeFrames(profile.keyframes),
    phases: Object.freeze({ ...profile.phases }),
    effect: Object.freeze({ ...profile.effect }),
  });
}

const PROFILES = {
  IDLE_GENTLE: freezeProfile({
    assetState: 'IDLE_GENTLE',
    durationMs: 6000,
    loop: true,
    phases: { riseMs: 900, peakMs: 4200, settleMs: 900 },
    returnState: null,
    easing: 'ease-in-out',
    keyframes: [
      { offset: 0, transform: 'translate3d(0, 2px, 0) scale(0.998)' },
      { offset: 0.25, transform: 'translate3d(0, 0, 0) scale(1.004)' },
      { offset: 0.55, transform: 'translate3d(-1px, -1px, 0) scale(1.003)' },
      { offset: 0.8, transform: 'translate3d(1px, 1px, 0) scale(0.999)' },
      { offset: 1, transform: 'translate3d(0, 2px, 0) scale(0.998)' },
    ],
    effect: { kind: 'none', intensity: 0 },
  }),
  GUIDE_PRESENT: freezeProfile({
    assetState: 'GUIDE_PRESENT',
    durationMs: 1500,
    loop: false,
    phases: { riseMs: 300, peakMs: 800, settleMs: 400 },
    returnState: 'IDLE_GENTLE',
    easing: 'cubic-bezier(.22,.75,.2,1)',
    keyframes: [
      { offset: 0, transform: 'translate3d(0, 4px, 0) scale(0.996)' },
      { offset: 0.2, transform: 'translate3d(0, 0, 0) scale(1)' },
      { offset: 0.55, transform: 'translate3d(1px, -2px, 0) scale(1.006)' },
      { offset: 0.82, transform: 'translate3d(0, -1px, 0) scale(1.002)' },
      { offset: 1, transform: 'translate3d(0, 1px, 0) scale(1)' },
    ],
    effect: { kind: 'none', intensity: 0 },
  }),
  HAPPY_WAVE: freezeProfile({
    assetState: 'HAPPY_WAVE',
    durationMs: 1450,
    loop: false,
    phases: { riseMs: 200, peakMs: 850, settleMs: 400 },
    returnState: 'IDLE_GENTLE',
    easing: 'cubic-bezier(.18,.88,.23,1)',
    keyframes: [
      { offset: 0, transform: 'translate3d(0, 4px, 0) scale(0.995)' },
      { offset: 0.16, transform: 'translate3d(-8px, -4px, 0) rotate(-1deg) scale(1.01)' },
      { offset: 0.42, transform: 'translate3d(8px, -8px, 0) rotate(1deg) scale(1.03)' },
      { offset: 0.7, transform: 'translate3d(-4px, -2px, 0) rotate(-0.5deg) scale(1.012)' },
      { offset: 1, transform: 'translate3d(0, 2px, 0) scale(1)' },
    ],
    effect: { kind: 'wind-cut', intensity: 3 },
  }),
  CURIOUS_CONFUSED: freezeProfile({
    assetState: 'CURIOUS_CONFUSED',
    durationMs: 2200,
    loop: false,
    phases: { riseMs: 220, peakMs: 520, settleMs: 1460 },
    returnState: 'IDLE_GENTLE',
    easing: 'cubic-bezier(.2,.8,.2,1)',
    keyframes: [
      { offset: 0, transform: 'translate3d(0, 3px, 0) scale(0.997)' },
      { offset: 0.14, transform: 'translate3d(-4px, -3px, 0) rotate(-1deg) scale(1.01)' },
      { offset: 0.3, transform: 'translate3d(5px, -5px, 0) rotate(0.8deg) scale(1.02)' },
      { offset: 0.55, transform: 'translate3d(-2px, -2px, 0) rotate(-0.3deg) scale(1.01)' },
      { offset: 0.78, transform: 'translate3d(1px, 1px, 0) rotate(0.2deg) scale(1.004)' },
      { offset: 1, transform: 'translate3d(0, 2px, 0) scale(1)' },
    ],
    effect: { kind: 'wind-cut', intensity: 1 },
  }),
  SHH: freezeProfile({
    assetState: 'SHH',
    durationMs: 1300,
    loop: false,
    phases: { riseMs: 240, peakMs: 820, settleMs: 240 },
    returnState: 'IDLE_GENTLE',
    easing: 'ease-in-out',
    keyframes: [
      { offset: 0, transform: 'translate3d(0, 2px, 0) scale(0.999)' },
      { offset: 0.3, transform: 'translate3d(0, 0, 0) scale(1.002)' },
      { offset: 0.62, transform: 'translate3d(-1px, 0, 0) scale(1.001)' },
      { offset: 1, transform: 'translate3d(0, 1px, 0) scale(1)' },
    ],
    effect: { kind: 'none', intensity: 0 },
  }),
  SURPRISED: freezeProfile({
    assetState: 'SURPRISED',
    durationMs: 840,
    loop: false,
    phases: { riseMs: 120, peakMs: 320, settleMs: 400 },
    returnState: 'IDLE_GENTLE',
    easing: 'cubic-bezier(.12,.9,.2,1)',
    keyframes: [
      { offset: 0, transform: 'translate3d(0, 2px, 0) scale(0.99)' },
      { offset: 0.12, transform: 'translate3d(0, -8px, 0) scale(1.05)' },
      { offset: 0.35, transform: 'translate3d(0, -6px, 0) scale(1.05)' },
      { offset: 0.68, transform: 'translate3d(0, -2px, 0) scale(1.015)' },
      { offset: 1, transform: 'translate3d(0, 2px, 0) scale(1)' },
    ],
    effect: { kind: 'wind-cut', intensity: 2 },
  }),
  TOUCH_CRY: freezeProfile({
    assetState: 'TOUCH_CRY',
    durationMs: 2200,
    loop: false,
    phases: { riseMs: 300, peakMs: 800, settleMs: 1100 },
    returnState: 'SAD_DOWNCAST',
    easing: 'cubic-bezier(.2,.75,.25,1)',
    keyframes: [
      { offset: 0, transform: 'translate3d(0, 1px, 0) scale(1)' },
      { offset: 0.16, transform: 'translate3d(-3px, -4px, 0) rotate(-0.4deg) scale(1.02)' },
      { offset: 0.36, transform: 'translate3d(2px, -2px, 0) rotate(0.3deg) scale(1.01)' },
      { offset: 0.6, transform: 'translate3d(0, 6px, 0) scale(0.98)' },
      { offset: 0.82, transform: 'translate3d(0, 10px, 0) rotate(-0.8deg) scale(0.97)' },
      { offset: 1, transform: 'translate3d(0, 6px, 0) scale(0.988)' },
    ],
    effect: { kind: 'tear', intensity: 2 },
  }),
  HAPPY_SMILE: freezeProfile({
    assetState: 'HAPPY_SMILE',
    durationMs: 900,
    loop: false,
    phases: { riseMs: 220, peakMs: 420, settleMs: 260 },
    returnState: 'IDLE_GENTLE',
    easing: 'cubic-bezier(.2,.82,.22,1)',
    keyframes: [
      { offset: 0, transform: 'translate3d(0, 2px, 0) scale(0.998)' },
      { offset: 0.28, transform: 'translate3d(0, -2px, 0) scale(1.012)' },
      { offset: 0.65, transform: 'translate3d(1px, -1px, 0) scale(1.006)' },
      { offset: 1, transform: 'translate3d(0, 1px, 0) scale(1)' },
    ],
    effect: { kind: 'none', intensity: 0 },
  }),
  SAD_DOWNCAST: freezeProfile({
    assetState: 'SAD_DOWNCAST',
    durationMs: 1800,
    loop: false,
    phases: { riseMs: 520, peakMs: 820, settleMs: 460 },
    returnState: 'IDLE_GENTLE',
    easing: 'cubic-bezier(.3,.55,.35,1)',
    keyframes: [
      { offset: 0, transform: 'translate3d(0, 4px, 0) scale(0.994)' },
      { offset: 0.3, transform: 'translate3d(0, 8px, 0) scale(0.985)' },
      { offset: 0.7, transform: 'translate3d(-1px, 8px, 0) scale(0.984)' },
      { offset: 1, transform: 'translate3d(0, 6px, 0) scale(0.988)' },
    ],
    effect: { kind: 'none', intensity: 0 },
  }),
};

export const SAASUNA_MOTION_STATES = Object.freeze(Object.keys(PROFILES));
export const SAASUNA_MOTION_PROFILES = Object.freeze(PROFILES);

function normalizeInput(input) {
  if (typeof input === 'string') return { partnerId: SAASUNA_PARTNER_ID, visualState: input };
  return input && typeof input === 'object' && !Array.isArray(input) ? input : {};
}

export function resolveSaasunaMotionState(input = {}) {
  const normalized = normalizeInput(input);
  if (normalized.partnerId && normalized.partnerId !== SAASUNA_PARTNER_ID) return null;
  const explicitState = typeof normalized.visualState === 'string' ? normalized.visualState : null;
  if (explicitState && Object.hasOwn(PROFILES, explicitState)) return explicitState;
  const derivedState = resolveSaasunaAdviceBustupState(normalized);
  return derivedState && Object.hasOwn(PROFILES, derivedState) ? derivedState : 'IDLE_GENTLE';
}

export function resolveSaasunaMotionPlan(input = {}) {
  const state = resolveSaasunaMotionState(input);
  if (!state) return null;
  const profile = SAASUNA_MOTION_PROFILES[state];
  const asset = SAASUNA_BUSTUP_ASSETS[profile.assetState];
  return Object.freeze({
    state,
    asset,
    durationMs: profile.durationMs,
    loop: profile.loop,
    easing: profile.easing,
    phases: profile.phases,
    returnState: profile.returnState,
    keyframes: profile.keyframes,
    effect: profile.effect,
  });
}

function safeAnimate(target, keyframes, timing) {
  if (!target || typeof target.animate !== 'function') return null;
  try {
    return target.animate(keyframes, timing);
  } catch {
    return null;
  }
}

function syncAsset(image, entry) {
  if (!image || !entry) return;
  if (image.dataset.assetFile !== entry.fileName) {
    image.src = entry.src;
    image.dataset.assetFile = entry.fileName;
  }
  image.alt = 'サースナー';
}

export function ensureSaasunaMotionStyle(doc) {
  if (!doc || !doc.head || doc.getElementById?.(MOTION_STYLE_ID)) return false;
  const style = doc.createElement('style');
  style.id = MOTION_STYLE_ID;
  style.textContent = [
    '.partnerAdviceBustupArt{position:relative;isolation:isolate}',
    '.partnerAdviceBustupArt>[data-role="saasuna-motion-crossfade"]{position:absolute!important;inset:0;z-index:2;display:block!important;width:100%;height:100%;object-fit:contain;object-position:center bottom;filter:drop-shadow(0 7px 10px rgba(0,0,0,.34));pointer-events:none}',
    '.partnerAdviceBustupArt>[data-role="saasuna-motion-crossfade"][hidden]{display:none!important}',
    '[data-role="saasuna-motion-effect"]{position:absolute;inset:8% -16%;z-index:3;display:grid;place-items:center;pointer-events:none;opacity:0;overflow:visible}',
    '[data-role="saasuna-motion-effect"] .saasunaWindCutLine{position:absolute;display:block;width:48%;height:3px;border-radius:999px;background:linear-gradient(90deg,transparent,rgba(223,255,245,.92) 25%,rgba(255,211,126,.86) 72%,transparent);box-shadow:0 0 8px rgba(176,255,226,.52);transform-origin:center}',
    '[data-role="saasuna-motion-effect"] .saasunaWindCutLine:nth-child(1){transform:translate(-14px,-12px) rotate(-16deg)}',
    '[data-role="saasuna-motion-effect"] .saasunaWindCutLine:nth-child(2){width:40%;transform:translate(8px,0) rotate(-16deg);opacity:.72}',
    '[data-role="saasuna-motion-effect"] .saasunaWindCutLine:nth-child(3){width:31%;transform:translate(21px,12px) rotate(-16deg);opacity:.44}',
    '[data-role="saasuna-motion-effect"][data-kind="tear"]{inset:20% 12% 10%;place-items:start center}',
    '[data-role="saasuna-motion-effect"][data-kind="tear"] .saasunaTearLine{display:block;width:5px;height:16px;border-radius:999px;background:linear-gradient(rgba(184,238,255,.9),rgba(95,166,224,.18));box-shadow:0 0 7px rgba(137,212,255,.55)}',
    '[data-role="saasuna-motion-effect"][data-kind="tear"] .saasunaTearLine:nth-child(1){transform:translate(-14px,10px)}',
    '[data-role="saasuna-motion-effect"][data-kind="tear"] .saasunaTearLine:nth-child(2){height:12px;transform:translate(14px,17px);opacity:.7}',
    '@media(prefers-reduced-motion:reduce){[data-role="saasuna-motion-effect"]{animation:none!important;transition:none!important}}',
  ].join('');
  doc.head.append(style);
  return true;
}

export function ensureSaasunaMotionSurface(doc, bustup) {
  if (!doc || !bustup?.figure || !bustup?.image) return null;
  const art = bustup.image.parentElement || bustup.figure.querySelector?.('.partnerAdviceBustupArt');
  if (!art) return null;
  let crossfadeImage = art.querySelector?.(`[data-role="${MOTION_CROSSFADE_ROLE}"]`);
  if (!crossfadeImage) {
    crossfadeImage = doc.createElement('img');
    crossfadeImage.dataset.role = MOTION_CROSSFADE_ROLE;
    crossfadeImage.decoding = 'async';
    crossfadeImage.loading = 'eager';
    crossfadeImage.draggable = false;
    crossfadeImage.hidden = true;
    art.append(crossfadeImage);
  }
  let effect = art.querySelector?.(`[data-role="${MOTION_EFFECT_ROLE}"]`);
  if (!effect) {
    effect = doc.createElement('span');
    effect.dataset.role = MOTION_EFFECT_ROLE;
    effect.setAttribute('aria-hidden', 'true');
    effect.innerHTML = '<i class="saasunaWindCutLine"></i><i class="saasunaWindCutLine"></i><i class="saasunaWindCutLine"></i><i class="saasunaTearLine"></i><i class="saasunaTearLine"></i>';
    art.append(effect);
  }
  return Object.freeze({ art, image: bustup.image, crossfadeImage, effect, figure: bustup.figure });
}

function runEffect(surface, effect, profile, animationState) {
  if (!surface?.effect) return;
  animationState.effectAnimation?.cancel?.();
  const kind = effect?.kind || 'none';
  surface.effect.dataset.kind = kind;
  surface.effect.hidden = kind === 'none';
  if (kind === 'none') return;
  const duration = Math.max(260, Math.min(profile.durationMs, kind === 'tear' ? 1100 : 720));
  const keyframes = kind === 'tear'
    ? [
      { opacity: 0, transform: 'translate3d(0, -5px, 0) scale(.8)' },
      { opacity: 0.86, transform: 'translate3d(0, 3px, 0) scale(1)' },
      { opacity: 0, transform: 'translate3d(0, 19px, 0) scale(.9)' },
    ]
    : [
      { opacity: 0, transform: 'translate3d(-25px, 10px, 0) rotate(-12deg) scaleX(.22)' },
      { opacity: Math.min(0.34 + profile.effect.intensity * 0.16, 0.9), transform: 'translate3d(0, 0, 0) rotate(-12deg) scaleX(1)' },
      { opacity: 0, transform: 'translate3d(28px, -9px, 0) rotate(-12deg) scaleX(.26)' },
    ];
  animationState.effectAnimation = safeAnimate(surface.effect, keyframes, {
    duration,
    easing: 'cubic-bezier(.16,.78,.22,1)',
    fill: 'both',
    iterations: 1,
  });
}

function runMotion(surface, profile, animationState) {
  animationState.motionAnimation?.cancel?.();
  const timing = {
    duration: profile.durationMs,
    easing: profile.easing,
    fill: 'both',
    iterations: profile.loop ? Infinity : 1,
  };
  const animation = safeAnimate(surface.image, profile.keyframes, timing);
  animationState.motionAnimation = animation;
  if (!animation && surface.image.style) {
    const lastFrame = profile.keyframes[profile.keyframes.length - 1];
    surface.image.style.transform = lastFrame.transform;
  }
}

function startAssetTransition(surface, plan, transitionMs, currentFile, isActive, done) {
  const shouldCrossfade = Boolean(
    surface.crossfadeImage &&
    currentFile &&
    currentFile !== plan.asset.fileName &&
    transitionMs > 0,
  );
  if (!shouldCrossfade) {
    syncAsset(surface.image, plan.asset);
    done();
    return;
  }
  const previousEntry = Object.values(SAASUNA_BUSTUP_ASSETS).find((entry) => entry.fileName === currentFile);
  if (previousEntry) syncAsset(surface.image, previousEntry);
  syncAsset(surface.crossfadeImage, plan.asset);
  surface.crossfadeImage.hidden = false;
  surface.crossfadeImage.style.opacity = '0';
  const outAnimation = safeAnimate(surface.image, [{ opacity: 1 }, { opacity: 0 }], {
    duration: transitionMs,
    easing: 'ease-out',
    fill: 'both',
  });
  const inAnimation = safeAnimate(surface.crossfadeImage, [{ opacity: 0 }, { opacity: 1 }], {
    duration: transitionMs,
    easing: 'ease-in',
    fill: 'both',
  });
  const finish = () => {
    if (!isActive()) return;
    syncAsset(surface.image, plan.asset);
    surface.image.style.opacity = '';
    surface.crossfadeImage.hidden = true;
    surface.crossfadeImage.style.opacity = '';
    outAnimation?.cancel?.();
    inAnimation?.cancel?.();
    done();
  };
  const finished = inAnimation?.finished;
  if (finished?.then) finished.then(finish, finish);
  else setTimeout(finish, transitionMs);
}

export function createSaasunaMotionController({ doc, bustup, transitionMs = 180 } = {}) {
  const surface = ensureSaasunaMotionSurface(doc, bustup);
  if (!surface) return null;
  ensureSaasunaMotionStyle(doc);
  const animationState = { motionAnimation: null, effectAnimation: null };
  let currentState = null;
  let currentAssetFile = surface.image.dataset.assetFile || null;
  let sequence = 0;

  const setState = (input = {}, options = {}) => {
    const plan = resolveSaasunaMotionPlan(input);
    if (!plan) return null;
    const restart = options.restart !== false;
    const stateChanged = currentState !== plan.state;
    const shouldRestart = restart || stateChanged;
    if (!shouldRestart && currentState === plan.state) return plan;
    sequence += 1;
    const activeSequence = sequence;
    currentState = plan.state;
    const previousAssetFile = currentAssetFile;
    currentAssetFile = plan.asset.fileName;
    surface.figure.dataset.motionState = plan.state;
    surface.figure.dataset.motionLoop = plan.loop ? 'true' : 'false';
    startAssetTransition(surface, plan, options.transitionMs ?? transitionMs, previousAssetFile, () => activeSequence === sequence, () => {
      if (activeSequence !== sequence) return;
      runMotion(surface, SAASUNA_MOTION_PROFILES[plan.state], animationState);
    });
    runEffect(surface, plan.effect, SAASUNA_MOTION_PROFILES[plan.state], animationState);
    return plan;
  };

  const clear = () => {
    sequence += 1;
    animationState.motionAnimation?.cancel?.();
    animationState.effectAnimation?.cancel?.();
    currentState = null;
    surface.effect.hidden = true;
    surface.crossfadeImage.hidden = true;
    delete surface.figure.dataset.motionState;
    delete surface.figure.dataset.motionLoop;
  };

  const settleTo = (state = 'IDLE_GENTLE', options = {}) => setState({
    partnerId: SAASUNA_PARTNER_ID,
    visualState: state,
  }, options);

  return Object.freeze({
    setState,
    settleTo,
    clear,
    snapshot: () => Object.freeze({ state: currentState, surface }),
  });
}
