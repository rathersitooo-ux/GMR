import {createTransitionDirector} from './ui-state-feedback-core.mjs';

export const SCREEN_NAVIGATION_REASON = Object.freeze({
  EMPTY_TARGET: 'EMPTY_TARGET',
  CURRENT_SCREEN: 'CURRENT_SCREEN',
  NAVIGATE: 'NAVIGATE'
});

export const SCREEN_NAVIGATION_FALLBACK_PARENT = Object.freeze({
  cards: 'home', characters: 'home', setup: 'home', missions: 'home', profile: 'home',
  shop: 'home', gacha: 'shop', records: 'home', settings: 'home'
});

export const SCREEN_NAVIGATION_COMMON_BUTTON_SFX = Object.freeze({
  filename: 'click_002.ogg', formalRole: 'shared-button', playbackAuthority: 'HUMAN_ACCEPTED_FORMAL_ASSET'
});

export const MENU_TRANSITION_MOTION_PROFILE = Object.freeze({NORMAL: 'normal', REDUCED: 'reduced', NONE: 'none'});

export const SCREEN_MOTION_PRESENTATION_SPEC = Object.freeze({
  [MENU_TRANSITION_MOTION_PROFILE.NORMAL]: Object.freeze({exitMs: 90, enterMs: 120, feedbackMs: 72, distancePx: 18, easing: 'cubic-bezier(.22,.72,.2,1)'}),
  [MENU_TRANSITION_MOTION_PROFILE.REDUCED]: Object.freeze({exitMs: 36, enterMs: 45, feedbackMs: 36, distancePx: 0, easing: 'linear'}),
  [MENU_TRANSITION_MOTION_PROFILE.NONE]: Object.freeze({exitMs: 0, enterMs: 0, feedbackMs: 0, distancePx: 0, easing: 'linear'})
});

export const SCREEN_MOTION_FAMILY = Object.freeze({ROUTE: 'route', CARDS: 'cards', CHARACTER: 'character', ECONOMY: 'economy', BATTLE: 'battle', UTILITY: 'utility'});

const SCREEN_MOTION_FAMILY_BY_SCREEN = Object.freeze({
  cards: SCREEN_MOTION_FAMILY.CARDS, deck: SCREEN_MOTION_FAMILY.CARDS,
  characters: SCREEN_MOTION_FAMILY.CHARACTER, partner: SCREEN_MOTION_FAMILY.CHARACTER,
  shop: SCREEN_MOTION_FAMILY.ECONOMY, gacha: SCREEN_MOTION_FAMILY.ECONOMY,
  setup: SCREEN_MOTION_FAMILY.BATTLE, battle: SCREEN_MOTION_FAMILY.BATTLE, result: SCREEN_MOTION_FAMILY.BATTLE,
  missions: SCREEN_MOTION_FAMILY.UTILITY, profile: SCREEN_MOTION_FAMILY.UTILITY,
  records: SCREEN_MOTION_FAMILY.UTILITY, settings: SCREEN_MOTION_FAMILY.UTILITY
});

const SCREEN_MOTION_KINETICS = Object.freeze({
  [SCREEN_MOTION_FAMILY.ROUTE]: Object.freeze({axis: 'y', enterSign: 1, scaleFrom: .995, rotateDeg: 0}),
  [SCREEN_MOTION_FAMILY.CARDS]: Object.freeze({axis: 'y', enterSign: 1, scaleFrom: .985, rotateDeg: -.7}),
  [SCREEN_MOTION_FAMILY.CHARACTER]: Object.freeze({axis: 'x', enterSign: -1, scaleFrom: 1.012, rotateDeg: 0}),
  [SCREEN_MOTION_FAMILY.ECONOMY]: Object.freeze({axis: 'x', enterSign: 1, scaleFrom: .992, rotateDeg: 0}),
  [SCREEN_MOTION_FAMILY.BATTLE]: Object.freeze({axis: 'y', enterSign: -1, scaleFrom: 1.01, rotateDeg: 0}),
  [SCREEN_MOTION_FAMILY.UTILITY]: Object.freeze({axis: 'x', enterSign: -1, scaleFrom: .995, rotateDeg: 0})
});

export const SCREEN_MOTION_PIECE_SELECTORS = Object.freeze({
  cards: Object.freeze(['.cardsGrid > .collection', '.cardsGrid > .deckBoard']),
  characters: Object.freeze(['.charLayout > .charStage', '.charLayout > .charRoster']),
  setup: Object.freeze(['.setupHero', '.setupBox']),
  shop: Object.freeze(['.shopGrid > .shopCard']),
  gacha: Object.freeze(['.gachaLayout > .gachaStage', '.gachaLayout > .gachaControls'])
});

export function resolveScreenMotionIntent(from, to, reason = 'navigation') {
  const destinationKey = String(to || '').trim().toLowerCase();
  const family = SCREEN_MOTION_FAMILY_BY_SCREEN[destinationKey] || SCREEN_MOTION_FAMILY.ROUTE;
  const base = SCREEN_MOTION_KINETICS[family];
  const reverseSemantic = reason === 'back' || destinationKey === 'home';
  return Object.freeze({
    from, to, family, bridge: `${family}-bridge`, reverseSemantic, axis: base.axis,
    enterSign: reverseSemantic ? -base.enterSign : base.enterSign,
    scaleFrom: base.scaleFrom,
    rotateDeg: reverseSemantic ? -base.rotateDeg : base.rotateDeg
  });
}

function commonButtonSfxUrl() {
  const moduleUrl = new URL(import.meta.url);
  const sourceBrowserModule = /\/browser\/screen-navigation-core\.mjs$/.test(moduleUrl.pathname);
  return new URL(sourceBrowserModule ? '../assets/audio/sfx/click_002.ogg' : './click_002.ogg', moduleUrl).href;
}

function hasActiveUserGesture() { return globalThis.navigator?.userActivation?.isActive === true; }
function playAcceptedNavigationSfx() {
  if (!hasActiveUserGesture()) return false;
  const AudioCtor = globalThis.Audio;
  if (typeof AudioCtor !== 'function') return false;
  try {
    const audio = new AudioCtor(commonButtonSfxUrl());
    const playback = audio?.play?.();
    if (playback && typeof playback.catch === 'function') playback.catch(() => {});
    return true;
  } catch { return false; }
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

function requireFunction(value, label) { if (typeof value !== 'function') throw new Error(`${label} must be a function`); return value; }
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

function transformFor(intent, distance, scale = 1, rotateDeg = 0) {
  const translate = intent.axis === 'x' ? `translate3d(${distance}px,0,0)` : `translate3d(0,${distance}px,0)`;
  const rotation = rotateDeg === 0 ? '' : ` rotate(${rotateDeg}deg)`;
  const scaling = scale === 1 ? '' : ` scale(${scale})`;
  return `${translate}${rotation}${scaling}`;
}

function presentationFrames(kind, spec, intent) {
  if (kind === 'press') return [{transform: 'scale(1)'}, {transform: 'scale(.985)'}, {transform: 'scale(1)'}];
  if (kind === 'focus') return [
    {boxShadow: '0 0 0 0 rgba(160,239,213,0)'},
    {boxShadow: '0 0 0 3px rgba(160,239,213,.34)'},
    {boxShadow: '0 0 0 0 rgba(160,239,213,0)'}
  ];
  if (spec.distancePx <= 0) return kind === 'exit' ? [{opacity: 1}, {opacity: .88}] : [{opacity: .86}, {opacity: 1}];
  const signedDistance = spec.distancePx * intent.enterSign;
  if (kind === 'exit') return [
    {opacity: 1, transform: transformFor(intent, 0)},
    {opacity: .84, transform: transformFor(intent, -signedDistance, 1 + ((1 - intent.scaleFrom) * .35), -intent.rotateDeg * .5)}
  ];
  return [
    {opacity: .8, transform: transformFor(intent, signedDistance, intent.scaleFrom, intent.rotateDeg)},
    {opacity: 1, transform: transformFor(intent, 0)}
  ];
}

function animationDuration(kind, spec) {
  if (kind === 'exit') return spec.exitMs;
  if (kind === 'enter') return spec.enterMs;
  return spec.feedbackMs;
}

function viewportSize(documentSource) {
  const root = documentSource?.documentElement;
  return {width: Number(root?.clientWidth) || 0, height: Number(root?.clientHeight) || 0};
}

function motionPieces(surface, screen) {
  if (!surface || typeof surface.querySelectorAll !== 'function') return [];
  const selectors = SCREEN_MOTION_PIECE_SELECTORS[String(screen || '').trim().toLowerCase()] || [];
  const pieces = [];
  for (const selector of selectors) {
    for (const node of surface.querySelectorAll(selector)) {
      if (!node || pieces.includes(node)) continue;
      const rect = node.getBoundingClientRect?.();
      if (!rect || !(rect.width > 0) || !(rect.height > 0)) continue;
      pieces.push(node);
    }
  }
  return pieces;
}

function pieceEnterFrames(piece, documentSource, intent) {
  const rect = piece?.getBoundingClientRect?.();
  const viewport = viewportSize(documentSource);
  if (!rect || !(viewport.width > 0) || !(viewport.height > 0)) return null;
  const margin = 12;
  let dx = 0;
  let dy = 0;
  if (intent.axis === 'x') {
    const fromLeft = -(rect.right + margin);
    const fromRight = viewport.width - rect.left + margin;
    dx = Math.abs(fromLeft) <= Math.abs(fromRight) ? fromLeft : fromRight;
  } else {
    const fromTop = -(rect.bottom + margin);
    const fromBottom = viewport.height - rect.top + margin;
    dy = Math.abs(fromTop) <= Math.abs(fromBottom) ? fromTop : fromBottom;
  }
  return [
    {opacity: .76, translate: `${dx}px ${dy}px`, scale: String(intent.scaleFrom)},
    {opacity: 1, translate: '0px 0px', scale: '1'}
  ];
}

export function createScreenMotionPresentationDriver({document: documentSource = globalThis.document, maxEvents = 32} = {}) {
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
      delete surface.dataset.screenMotionBridge;
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
      revision: context.revision, signal: context.signal,
      outgoing: screenSurface(documentSource, context.from), incoming: null,
      pressedControl: null, animations: new Set(), onAbort: null, exitPromise: null,
      intent: resolveScreenMotionIntent(context.from, context.to, context.reason)
    };
    session.pressedControl = containsNode(session.outgoing, documentSource?.activeElement) ? documentSource.activeElement : null;
    session.onAbort = () => finishRevision(context.revision, 'aborted');
    context.signal?.addEventListener?.('abort', session.onAbort, {once: true});
    sessions.set(context.revision, session);
    return session;
  }

  function mark(surface, context, phase, intent) {
    if (!surface?.dataset) return;
    surface.dataset.screenMotionRevision = String(context.revision);
    surface.dataset.screenMotionPhase = String(phase).toLowerCase();
    surface.dataset.screenMotionProfile = context.motionProfile;
    surface.dataset.screenMotionFamily = intent.family;
    surface.dataset.screenMotionBridge = intent.bridge;
  }

  async function animateFrames(session, target, kind, context, frames, eventExtra = {}) {
    const spec = SCREEN_MOTION_PRESENTATION_SPEC[context.motionProfile] || SCREEN_MOTION_PRESENTATION_SPEC[MENU_TRANSITION_MOTION_PROFILE.NORMAL];
    const duration = animationDuration(kind, spec);
    if (!target || duration === 0 || typeof target.animate !== 'function' || context.signal?.aborted) {
      record({revision: context.revision, phase: context.phase, kind, status: 'no_effect', profile: context.motionProfile, family: session.intent.family, bridge: session.intent.bridge, ...eventExtra});
      return;
    }
    let animation;
    try {
      animation = target.animate(frames, {duration, easing: spec.easing, fill: 'none'});
    } catch (error) {
      record({revision: context.revision, phase: context.phase, kind, status: 'failed_soft', profile: context.motionProfile, family: session.intent.family, bridge: session.intent.bridge, ...eventExtra, errorName: error instanceof Error ? error.name : 'Error'});
      return;
    }
    session.animations.add(animation);
    const cancel = () => animation.cancel?.();
    context.signal?.addEventListener?.('abort', cancel, {once: true});
    try {
      await Promise.resolve(animation.finished);
      record({revision: context.revision, phase: context.phase, kind, status: 'completed', profile: context.motionProfile, family: session.intent.family, bridge: session.intent.bridge, ...eventExtra});
    } catch (error) {
      record({revision: context.revision, phase: context.phase, kind, status: context.signal?.aborted ? 'aborted' : 'failed_soft', profile: context.motionProfile, family: session.intent.family, bridge: session.intent.bridge, ...eventExtra, errorName: error instanceof Error ? error.name : 'Error'});
    } finally {
      context.signal?.removeEventListener?.('abort', cancel);
      session.animations.delete(animation);
      animation.cancel?.();
    }
  }

  async function animate(session, target, kind, context) {
    const spec = SCREEN_MOTION_PRESENTATION_SPEC[context.motionProfile] || SCREEN_MOTION_PRESENTATION_SPEC[MENU_TRANSITION_MOTION_PROFILE.NORMAL];
    return animateFrames(session, target, kind, context, presentationFrames(kind, spec, session.intent));
  }

  async function animateIncoming(session, context) {
    if (context.motionProfile !== MENU_TRANSITION_MOTION_PROFILE.NORMAL) {
      await animate(session, session.incoming, 'enter', context);
      return;
    }
    const pieces = motionPieces(session.incoming, context.to);
    const frames = pieces.map((piece) => pieceEnterFrames(piece, documentSource, session.intent));
    if (pieces.length < 2 || frames.some((value) => !value)) {
      await animate(session, session.incoming, 'enter', context);
      return;
    }
    record({revision: context.revision, phase: context.phase, kind: 'multi_surface_enter', status: 'started', profile: context.motionProfile, family: session.intent.family, bridge: session.intent.bridge, pieceCount: pieces.length});
    await Promise.all(pieces.map((piece, index) => animateFrames(session, piece, 'enter', context, frames[index], {pieceIndex: index, pieceCount: pieces.length, multiSurface: true})));
  }

  async function runPhase(phase, context) {
    const session = ensureSession(context);
    if (context.signal?.aborted) return;
    const phaseContext = Object.freeze({...context, phase});
    try {
      if (phase === 'PREPARE') {
        mark(session.outgoing, context, phase, session.intent);
        void animate(session, session.pressedControl, 'press', phaseContext);
      } else if (phase === 'EXIT') {
        mark(session.outgoing, context, phase, session.intent);
        session.exitPromise = animate(session, session.outgoing, 'exit', phaseContext);
      } else if (phase === 'SWAP') {
        session.incoming = screenSurface(documentSource, context.to);
        mark(session.incoming, context, phase, session.intent);
        record({revision: context.revision, phase, kind: 'surface_swap_observed', status: session.incoming ? 'completed' : 'surface_missing', profile: context.motionProfile, family: session.intent.family, bridge: session.intent.bridge});
      } else if (phase === 'ENTER') {
        mark(session.incoming, context, phase, session.intent);
        const exitPromise = session.exitPromise || Promise.resolve();
        const enterPromise = animateIncoming(session, phaseContext);
        await Promise.all([exitPromise, enterPromise]);
        session.exitPromise = null;
      } else if (phase === 'SETTLE') {
        mark(session.incoming, context, phase, session.intent);
        const focusedControl = containsNode(session.incoming, documentSource?.activeElement) ? documentSource.activeElement : null;
        await animate(session, focusedControl, 'focus', phaseContext);
        finishRevision(context.revision, 'settled');
      }
    } catch (error) {
      record({revision: context.revision, phase, kind: 'driver', status: 'failed_soft', errorName: error instanceof Error ? error.name : 'Error'});
      finishRevision(context.revision, 'failed_soft');
    }
  }

  function getState() {
    return Object.freeze({activeRevisions: Object.freeze([...sessions.keys()]), events: Object.freeze(events.map((event) => Object.freeze({...event})))});
  }
  return Object.freeze({runPhase, finishRevision, getState});
}

export function createScreenTransitionRuntimeAdapter({
  getCurrentScreen, applyScreen, runVisualPhase = async () => {},
  presentationDriver = createScreenMotionPresentationDriver(), navigationBridge = createScreenNavigationRuntimeBridge(),
  reducedMotion = false, lowPerf = false
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
      from: decision.from, to: decision.to, reason,
      reducedMotion: readBoolean(reducedMotion), lowPerf: readBoolean(lowPerf),
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
    navigate, back, cancel: director.cancel, getState: director.getState,
    getPresentationState: typeof presentationDriver.getState === 'function' ? presentationDriver.getState : () => Object.freeze({activeRevisions: Object.freeze([]), events: Object.freeze([])})
  });
}
