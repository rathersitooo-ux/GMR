import {createTransitionDirector} from './ui-state-feedback-core.mjs';

export const SCREEN_NAVIGATION_REASON = Object.freeze({
  EMPTY_TARGET: 'EMPTY_TARGET',
  CURRENT_SCREEN: 'CURRENT_SCREEN',
  NAVIGATE: 'NAVIGATE'
});

export const SCREEN_NAVIGATION_FALLBACK_PARENT = Object.freeze({
  cards: 'home',
  characters: 'home',
  setup: 'home',
  missions: 'home',
  profile: 'home',
  shop: 'home',
  gacha: 'shop',
  records: 'home',
  settings: 'home'
});

export const SCREEN_NAVIGATION_COMMON_BUTTON_SFX = Object.freeze({
  filename: 'click_002.ogg',
  formalRole: 'shared-button',
  playbackAuthority: 'HUMAN_ACCEPTED_FORMAL_ASSET'
});

export const MENU_TRANSITION_MOTION_PROFILE = Object.freeze({
  NORMAL: 'normal',
  REDUCED: 'reduced',
  NONE: 'none'
});

export const SCREEN_MOTION_PRESENTATION_SPEC = Object.freeze({
  [MENU_TRANSITION_MOTION_PROFILE.NORMAL]: Object.freeze({
    exitMs: 90,
    enterMs: 120,
    feedbackMs: 72,
    distancePx: 18,
    easing: 'cubic-bezier(.22,.72,.2,1)'
  }),
  [MENU_TRANSITION_MOTION_PROFILE.REDUCED]: Object.freeze({
    exitMs: 36,
    enterMs: 45,
    feedbackMs: 36,
    distancePx: 0,
    easing: 'linear'
  }),
  [MENU_TRANSITION_MOTION_PROFILE.NONE]: Object.freeze({
    exitMs: 0,
    enterMs: 0,
    feedbackMs: 0,
    distancePx: 0,
    easing: 'linear'
  })
});

export const SCREEN_MOTION_FAMILIES = Object.freeze({
  HOME: 'home',
  CARDS: 'cards',
  PARTNER: 'partner',
  SETUP: 'setup',
  BATTLE: 'battle',
  RESULT: 'result',
  COMMERCE: 'commerce',
  UTILITY: 'utility'
});

export const SCREEN_MOTION_SCREEN_FAMILY = Object.freeze({
  home: SCREEN_MOTION_FAMILIES.HOME,
  cards: SCREEN_MOTION_FAMILIES.CARDS,
  characters: SCREEN_MOTION_FAMILIES.PARTNER,
  profile: SCREEN_MOTION_FAMILIES.PARTNER,
  setup: SCREEN_MOTION_FAMILIES.SETUP,
  friendroom: SCREEN_MOTION_FAMILIES.SETUP,
  battle: SCREEN_MOTION_FAMILIES.BATTLE,
  result: SCREEN_MOTION_FAMILIES.RESULT,
  shop: SCREEN_MOTION_FAMILIES.COMMERCE,
  gacha: SCREEN_MOTION_FAMILIES.COMMERCE,
  missions: SCREEN_MOTION_FAMILIES.UTILITY,
  records: SCREEN_MOTION_FAMILIES.UTILITY,
  settings: SCREEN_MOTION_FAMILIES.UTILITY
});

const SCREEN_MOTION_FAMILY_CHOREOGRAPHY = Object.freeze({
  [SCREEN_MOTION_FAMILIES.HOME]: Object.freeze({
    axis: 'x', distancePx: 28, rotateDeg: .65, scale: .992, staggerMs: 18,
    selectors: Object.freeze(['.codexHomeLeftRail', '.homeSlidePad', '.homeUtilities', '.homeScene', '.heroRuntime'])
  }),
  [SCREEN_MOTION_FAMILIES.CARDS]: Object.freeze({
    axis: 'x', distancePx: 36, rotateDeg: -.8, scale: .988, staggerMs: 16,
    selectors: Object.freeze(['.collection', '.deckBoard', '.cardPreview', '.r4DeckTrayToggle'])
  }),
  [SCREEN_MOTION_FAMILIES.PARTNER]: Object.freeze({
    axis: 'x', distancePx: 24, rotateDeg: .35, scale: .982, staggerMs: 22,
    selectors: Object.freeze(['.charStage', '.charRoster', '.profileStage', '.profileStats'])
  }),
  [SCREEN_MOTION_FAMILIES.SETUP]: Object.freeze({
    axis: 'y', distancePx: 24, rotateDeg: 0, scale: .985, staggerMs: 20,
    selectors: Object.freeze(['.setupHero', '.setupBox', '.friendRoomPanel'])
  }),
  [SCREEN_MOTION_FAMILIES.BATTLE]: Object.freeze({
    axis: 'y', distancePx: 18, rotateDeg: 0, scale: .992, staggerMs: 12,
    selectors: Object.freeze(['.battleTopStatus', '.publicTurnHud', '.board', '.battleInfo', '.battleRail', '.targetBox', '.battlePhaseSurface'])
  }),
  [SCREEN_MOTION_FAMILIES.RESULT]: Object.freeze({
    axis: 'y', distancePx: 34, rotateDeg: 0, scale: .965, staggerMs: 24,
    selectors: Object.freeze(['.resultRank', '.resultBody', '.resultBtns'])
  }),
  [SCREEN_MOTION_FAMILIES.COMMERCE]: Object.freeze({
    axis: 'x', distancePx: 30, rotateDeg: .55, scale: .98, staggerMs: 18,
    selectors: Object.freeze(['.gachaStage', '.gachaControls', '.shopGrid', '.shopCard'])
  }),
  [SCREEN_MOTION_FAMILIES.UTILITY]: Object.freeze({
    axis: 'y', distancePx: 18, rotateDeg: 0, scale: .99, staggerMs: 14,
    selectors: Object.freeze(['.simplePanel', '.missionGrid', '#recordsList', '.audioDevBox'])
  })
});

export function classifyScreenMotionFamily(screen) {
  return SCREEN_MOTION_SCREEN_FAMILY[screen] || SCREEN_MOTION_FAMILIES.UTILITY;
}

export function resolveScreenMotionChoreography(screen, motionProfile = MENU_TRANSITION_MOTION_PROFILE.NORMAL) {
  const profile = Object.values(MENU_TRANSITION_MOTION_PROFILE).includes(motionProfile)
    ? motionProfile
    : MENU_TRANSITION_MOTION_PROFILE.NORMAL;
  const family = classifyScreenMotionFamily(screen);
  const base = SCREEN_MOTION_FAMILY_CHOREOGRAPHY[family];
  if (profile === MENU_TRANSITION_MOTION_PROFILE.NONE) {
    return Object.freeze({screen, family, profile, axis: base.axis, distancePx: 0, rotateDeg: 0, scale: 1, staggerMs: 0, layerLimit: 0, selectors: Object.freeze([])});
  }
  if (profile === MENU_TRANSITION_MOTION_PROFILE.REDUCED) {
    return Object.freeze({screen, family, profile, axis: base.axis, distancePx: 0, rotateDeg: 0, scale: 1, staggerMs: 0, layerLimit: 2, selectors: base.selectors});
  }
  return Object.freeze({screen, family, profile, ...base, layerLimit: 6});
}

function commonButtonSfxUrl() {
  const moduleUrl = new URL(import.meta.url);
  const sourceBrowserModule = /\/browser\/screen-navigation-core\.mjs$/.test(moduleUrl.pathname);
  return new URL(sourceBrowserModule ? '../assets/audio/sfx/click_002.ogg' : './click_002.ogg', moduleUrl).href;
}

function hasActiveUserGesture() {
  return globalThis.navigator?.userActivation?.isActive === true;
}

function playAcceptedNavigationSfx() {
  if (!hasActiveUserGesture()) return false;
  const AudioCtor = globalThis.Audio;
  if (typeof AudioCtor !== 'function') return false;
  try {
    const audio = new AudioCtor(commonButtonSfxUrl());
    const playback = audio?.play?.();
    if (playback && typeof playback.catch === 'function') playback.catch(() => {});
    return true;
  } catch {
    return false;
  }
}

export function resolveScreenNavigation(currentScreen, requestedTarget) {
  if (!requestedTarget) return {ok: false, from: currentScreen, to: currentScreen, reason: SCREEN_NAVIGATION_REASON.EMPTY_TARGET};
  if (requestedTarget === currentScreen) return {ok: false, from: currentScreen, to: currentScreen, reason: SCREEN_NAVIGATION_REASON.CURRENT_SCREEN};
  const decision = {ok: true, from: currentScreen, to: requestedTarget, reason: SCREEN_NAVIGATION_REASON.NAVIGATE};
  playAcceptedNavigationSfx();
  return decision;
}

export function resolveScreenBackTarget(currentScreen, historyEntry) {
  return historyEntry?.screen || SCREEN_NAVIGATION_FALLBACK_PARENT[currentScreen] || 'home';
}

export function createScreenNavigationRuntimeBridge() {
  return Object.freeze({
    resolve(currentScreen, requestedTarget) { return resolveScreenNavigation(currentScreen, requestedTarget); },
    resolveBackTarget(currentScreen, historyEntry) { return resolveScreenBackTarget(currentScreen, historyEntry); }
  });
}

function requireFunction(value, label) {
  if (typeof value !== 'function') throw new Error(`${label} must be a function`);
  return value;
}

function readBoolean(source) { return Boolean(typeof source === 'function' ? source() : source); }
function resolveMotionProfile({reducedMotion, lowPerf}) {
  if (reducedMotion) return MENU_TRANSITION_MOTION_PROFILE.NONE;
  if (lowPerf) return MENU_TRANSITION_MOTION_PROFILE.REDUCED;
  return MENU_TRANSITION_MOTION_PROFILE.NORMAL;
}
function freezeTransitionResult(result) { return Object.freeze(result); }

function screenSurface(documentSource, screen) {
  if (!documentSource || typeof documentSource.querySelectorAll !== 'function') return null;
  return [...documentSource.querySelectorAll('.screen[data-screen]')].find((candidate) => candidate?.dataset?.screen === screen) || null;
}

function containsNode(surface, node) { return Boolean(surface && node && (surface === node || surface.contains?.(node))); }

function presentationFrames(kind, spec, axis, reverse) {
  const signedDistance = spec.distancePx * (reverse ? -1 : 1);
  const translate = (distance) => axis === 'x' ? `translate3d(${distance}px,0,0)` : `translate3d(0,${distance}px,0)`;
  if (kind === 'press') return [{transform: 'scale(1)'}, {transform: 'scale(.985)'}, {transform: 'scale(1)'}];
  if (kind === 'focus') return [
    {boxShadow: '0 0 0 0 rgba(160,239,213,0)'},
    {boxShadow: '0 0 0 3px rgba(160,239,213,.34)'},
    {boxShadow: '0 0 0 0 rgba(160,239,213,0)'}
  ];
  if (kind === 'exit') return spec.distancePx > 0
    ? [{opacity: 1, transform: translate(0)}, {opacity: .86, transform: translate(-signedDistance)}]
    : [{opacity: 1}, {opacity: .88}];
  return spec.distancePx > 0
    ? [{opacity: .82, transform: translate(signedDistance)}, {opacity: 1, transform: translate(0)}]
    : [{opacity: .86}, {opacity: 1}];
}

function layerTransform(choreography, distance, reverse, intensity = 1) {
  const sign = reverse ? -1 : 1;
  const d = distance * sign * intensity;
  const translation = choreography.axis === 'x' ? `translate3d(${d}px,0,0)` : `translate3d(0,${d}px,0)`;
  const rotation = choreography.rotateDeg * sign * intensity;
  const scale = 1 - ((1 - choreography.scale) * intensity);
  return `${translation} rotate(${rotation}deg) scale(${scale})`;
}

function layerFrames(kind, choreography, reverse) {
  if (choreography.profile === MENU_TRANSITION_MOTION_PROFILE.REDUCED) {
    return kind === 'exit' ? [{opacity: 1}, {opacity: .94}] : [{opacity: .92}, {opacity: 1}];
  }
  if (kind === 'exit') return [
    {opacity: 1, transform: 'translate3d(0,0,0) rotate(0deg) scale(1)'},
    {opacity: .42, transform: layerTransform(choreography, -choreography.distancePx * .55, reverse)}
  ];
  return [
    {opacity: .18, transform: layerTransform(choreography, choreography.distancePx, reverse)},
    {opacity: 1, transform: 'translate3d(0,0,0) rotate(0deg) scale(1)'}
  ];
}

function animationDuration(kind, spec) {
  if (kind === 'exit') return spec.exitMs;
  if (kind === 'enter') return spec.enterMs;
  return spec.feedbackMs;
}

function choreographyTargets(surface, choreography) {
  if (!surface || choreography.layerLimit === 0 || typeof surface.querySelectorAll !== 'function') return [];
  const targets = [];
  const seen = new Set();
  for (const selector of choreography.selectors) {
    for (const node of surface.querySelectorAll(selector) || []) {
      if (!node || seen.has(node)) continue;
      seen.add(node);
      targets.push(node);
      if (targets.length >= choreography.layerLimit) return targets;
    }
  }
  return targets;
}

/** Presentation-only WAAPI driver. Semantic screen ownership stays in TransitionDirector. */
export function createScreenMotionPresentationDriver({document: documentSource = globalThis.document, maxEvents = 48} = {}) {
  const sessions = new Map();
  const events = [];
  const record = (event) => {
    events.push(Object.freeze({...event}));
    if (events.length > maxEvents) events.splice(0, events.length - maxEvents);
  };
  const markerTargets = (session) => [...new Set([session.outgoing, session.incoming].filter(Boolean))];

  function clearMarkers(session) {
    const revision = String(session.revision);
    for (const surface of markerTargets(session)) {
      if (surface.dataset?.screenMotionRevision !== revision) continue;
      delete surface.dataset.screenMotionRevision;
      delete surface.dataset.screenMotionPhase;
      delete surface.dataset.screenMotionProfile;
      delete surface.dataset.screenMotionFamily;
    }
  }

  function finishRevision(revision, status = 'finished') {
    const session = sessions.get(revision);
    if (!session) return false;
    sessions.delete(revision);
    session.signal?.removeEventListener?.('abort', session.onAbort);
    for (const animation of session.animations) animation.cancel?.();
    session.animations.clear();
    clearMarkers(session);
    record({revision, phase: 'CLEANUP', status});
    return true;
  }

  function ensureSession(context) {
    let session = sessions.get(context.revision);
    if (session) return session;
    session = {
      revision: context.revision,
      signal: context.signal,
      outgoing: screenSurface(documentSource, context.from),
      incoming: null,
      pressedControl: null,
      animations: new Set(),
      onAbort: null
    };
    session.pressedControl = containsNode(session.outgoing, documentSource?.activeElement) ? documentSource.activeElement : null;
    session.onAbort = () => finishRevision(context.revision, 'aborted');
    context.signal?.addEventListener?.('abort', session.onAbort, {once: true});
    sessions.set(context.revision, session);
    return session;
  }

  function mark(surface, context, phase, screen) {
    if (!surface?.dataset) return;
    surface.dataset.screenMotionRevision = String(context.revision);
    surface.dataset.screenMotionPhase = String(phase).toLowerCase();
    surface.dataset.screenMotionProfile = context.motionProfile;
    surface.dataset.screenMotionFamily = classifyScreenMotionFamily(screen);
  }

  function shortAxis() {
    const root = documentSource?.documentElement;
    const width = Number(root?.clientWidth) || 0;
    const height = Number(root?.clientHeight) || 0;
    return width > height ? 'y' : 'x';
  }

  async function runAnimation(session, target, frames, options, context, metadata) {
    if (!target || options.duration === 0 || typeof target.animate !== 'function' || context.signal?.aborted) {
      record({...metadata, revision: context.revision, phase: context.phase, status: 'no_effect', profile: context.motionProfile});
      return;
    }
    let animation;
    try {
      animation = target.animate(frames, options);
    } catch (error) {
      record({...metadata, revision: context.revision, phase: context.phase, status: 'failed_soft', profile: context.motionProfile, errorName: error instanceof Error ? error.name : 'Error'});
      return;
    }
    session.animations.add(animation);
    const cancel = () => animation.cancel?.();
    context.signal?.addEventListener?.('abort', cancel, {once: true});
    try {
      await Promise.resolve(animation.finished);
      record({...metadata, revision: context.revision, phase: context.phase, status: 'completed', profile: context.motionProfile});
    } catch (error) {
      record({...metadata, revision: context.revision, phase: context.phase, status: context.signal?.aborted ? 'aborted' : 'failed_soft', profile: context.motionProfile, errorName: error instanceof Error ? error.name : 'Error'});
    } finally {
      context.signal?.removeEventListener?.('abort', cancel);
      session.animations.delete(animation);
      animation.cancel?.();
    }
  }

  async function animateSurface(session, target, kind, context) {
    const spec = SCREEN_MOTION_PRESENTATION_SPEC[context.motionProfile] || SCREEN_MOTION_PRESENTATION_SPEC.normal;
    const duration = animationDuration(kind, spec);
    return runAnimation(
      session,
      target,
      presentationFrames(kind, spec, shortAxis(), context.reason === 'back' || context.to === 'home'),
      {duration, easing: spec.easing, fill: 'none'},
      context,
      {kind}
    );
  }

  async function animateLayers(session, surface, screen, kind, context) {
    const choreography = resolveScreenMotionChoreography(screen, context.motionProfile);
    const targets = choreographyTargets(surface, choreography);
    if (!targets.length) {
      record({revision: context.revision, phase: context.phase, kind: 'family_layers', family: choreography.family, status: 'no_layers', profile: context.motionProfile});
      return;
    }
    const baseSpec = SCREEN_MOTION_PRESENTATION_SPEC[context.motionProfile] || SCREEN_MOTION_PRESENTATION_SPEC.normal;
    const reverse = context.reason === 'back' || context.to === 'home';
    await Promise.all(targets.map((target, index) => runAnimation(
      session,
      target,
      layerFrames(kind, choreography, reverse),
      {
        duration: animationDuration(kind, baseSpec) + (context.motionProfile === MENU_TRANSITION_MOTION_PROFILE.NORMAL ? 34 : 0),
        delay: choreography.staggerMs * index,
        easing: baseSpec.easing,
        fill: 'none'
      },
      context,
      {kind: 'family_layer', family: choreography.family, layerIndex: index}
    )));
  }

  async function runPhase(phase, context) {
    const session = ensureSession(context);
    if (context.signal?.aborted) return;
    const phaseContext = Object.freeze({...context, phase});
    try {
      if (phase === 'PREPARE') {
        mark(session.outgoing, context, phase, context.from);
        void animateSurface(session, session.pressedControl, 'press', phaseContext);
      } else if (phase === 'EXIT') {
        mark(session.outgoing, context, phase, context.from);
        await Promise.all([
          animateSurface(session, session.outgoing, 'exit', phaseContext),
          animateLayers(session, session.outgoing, context.from, 'exit', phaseContext)
        ]);
      } else if (phase === 'SWAP') {
        session.incoming = screenSurface(documentSource, context.to);
        mark(session.incoming, context, phase, context.to);
        record({revision: context.revision, phase, kind: 'surface_swap_observed', family: classifyScreenMotionFamily(context.to), status: session.incoming ? 'completed' : 'surface_missing', profile: context.motionProfile});
      } else if (phase === 'ENTER') {
        mark(session.incoming, context, phase, context.to);
        await Promise.all([
          animateSurface(session, session.incoming, 'enter', phaseContext),
          animateLayers(session, session.incoming, context.to, 'enter', phaseContext)
        ]);
      } else if (phase === 'SETTLE') {
        mark(session.incoming, context, phase, context.to);
        const focusedControl = containsNode(session.incoming, documentSource?.activeElement) ? documentSource.activeElement : null;
        await animateSurface(session, focusedControl, 'focus', phaseContext);
        finishRevision(context.revision, 'settled');
      }
    } catch (error) {
      record({revision: context.revision, phase, kind: 'driver', status: 'failed_soft', errorName: error instanceof Error ? error.name : 'Error'});
      finishRevision(context.revision, 'failed_soft');
    }
  }

  function getState() {
    return Object.freeze({activeRevisions: Object.freeze([...sessions.keys()]), events: Object.freeze(events.map((event) => Object.freeze({...event}))) });
  }

  return Object.freeze({runPhase, finishRevision, getState});
}

/** Interruptible screen transition runtime shared by Home and non-Home screens. */
export function createScreenTransitionRuntimeAdapter({
  getCurrentScreen,
  applyScreen,
  runVisualPhase = async () => {},
  presentationDriver = createScreenMotionPresentationDriver(),
  navigationBridge = createScreenNavigationRuntimeBridge(),
  reducedMotion = false,
  lowPerf = false
} = {}) {
  requireFunction(getCurrentScreen, 'getCurrentScreen');
  requireFunction(applyScreen, 'applyScreen');
  requireFunction(runVisualPhase, 'runVisualPhase');
  if (!presentationDriver || typeof presentationDriver.runPhase !== 'function') throw new Error('presentationDriver must expose runPhase');
  if (!navigationBridge || typeof navigationBridge.resolve !== 'function' || typeof navigationBridge.resolveBackTarget !== 'function') throw new Error('navigationBridge must expose resolve and resolveBackTarget');

  const director = createTransitionDirector({
    runPhase: async (phase, context) => {
      const motionProfile = resolveMotionProfile(context);
      const visualContext = Object.freeze({...context, motionProfile});
      await Promise.all([presentationDriver.runPhase(phase, visualContext), runVisualPhase(phase, visualContext)]);
    }
  });

  async function navigate(requestedTarget, {reason = 'navigation'} = {}) {
    const from = getCurrentScreen();
    const decision = navigationBridge.resolve(from, requestedTarget);
    if (!decision.ok) {
      if (decision.reason === SCREEN_NAVIGATION_REASON.CURRENT_SCREEN && director.getState().activeRevision !== null) director.cancel();
      return freezeTransitionResult({status: 'ignored', revision: director.getState().revision, from: decision.from, to: decision.to, swapped: false, reason: decision.reason});
    }

    const result = await director.start({
      from: decision.from,
      to: decision.to,
      reason,
      reducedMotion: readBoolean(reducedMotion),
      lowPerf: readBoolean(lowPerf),
      applySwap: (context) => {
        const applied = applyScreen(decision.to, Object.freeze({from: decision.from, to: decision.to, reason, revision: context.revision}));
        if (applied && typeof applied.then === 'function') throw new Error('applyScreen must be synchronous');
      }
    });

    presentationDriver.finishRevision?.(result.revision, result.status);
    return freezeTransitionResult({...result, navigationReason: decision.reason});
  }

  async function back(historyEntry, options = {}) {
    const current = getCurrentScreen();
    const target = navigationBridge.resolveBackTarget(current, historyEntry);
    return navigate(target, {reason: options.reason || 'back'});
  }

  return Object.freeze({
    navigate,
    back,
    cancel: director.cancel,
    getState: director.getState,
    getPresentationState: typeof presentationDriver.getState === 'function'
      ? presentationDriver.getState
      : () => Object.freeze({activeRevisions: Object.freeze([]), events: Object.freeze([])})
  });
}
