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

function commonButtonSfxUrl() {
  const moduleUrl = new URL(import.meta.url);
  const sourceBrowserModule = /\/browser\/screen-navigation-core\.mjs$/.test(moduleUrl.pathname);
  return new URL(
    sourceBrowserModule
      ? '../assets/audio/sfx/click_002.ogg'
      : './click_002.ogg',
    moduleUrl
  ).href;
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
  if (!requestedTarget) {
    return {
      ok: false,
      from: currentScreen,
      to: currentScreen,
      reason: SCREEN_NAVIGATION_REASON.EMPTY_TARGET
    };
  }

  if (requestedTarget === currentScreen) {
    return {
      ok: false,
      from: currentScreen,
      to: currentScreen,
      reason: SCREEN_NAVIGATION_REASON.CURRENT_SCREEN
    };
  }

  const decision = {
    ok: true,
    from: currentScreen,
    to: requestedTarget,
    reason: SCREEN_NAVIGATION_REASON.NAVIGATE
  };
  playAcceptedNavigationSfx();
  return decision;
}

export function resolveScreenBackTarget(currentScreen, historyEntry) {
  return historyEntry?.screen
    || SCREEN_NAVIGATION_FALLBACK_PARENT[currentScreen]
    || 'home';
}

export function createScreenNavigationRuntimeBridge() {
  return Object.freeze({
    resolve(currentScreen, requestedTarget) {
      return resolveScreenNavigation(currentScreen, requestedTarget);
    },
    resolveBackTarget(currentScreen, historyEntry) {
      return resolveScreenBackTarget(currentScreen, historyEntry);
    }
  });
}

function requireFunction(value, label) {
  if (typeof value !== 'function') throw new Error(`${label} must be a function`);
  return value;
}

function readBoolean(source) {
  return Boolean(typeof source === 'function' ? source() : source);
}

function resolveMotionProfile({reducedMotion, lowPerf}) {
  if (reducedMotion) return MENU_TRANSITION_MOTION_PROFILE.NONE;
  if (lowPerf) return MENU_TRANSITION_MOTION_PROFILE.REDUCED;
  return MENU_TRANSITION_MOTION_PROFILE.NORMAL;
}

function freezeTransitionResult(result) {
  return Object.freeze(result);
}

/**
 * Interruptible screen transition runtime shared by Home and non-Home screens.
 * Semantic navigation remains authoritative in this module; animation can only
 * decorate the director phases and never owns the selected screen.
 */
export function createScreenTransitionRuntimeAdapter({
  getCurrentScreen,
  applyScreen,
  runVisualPhase = async () => {},
  navigationBridge = createScreenNavigationRuntimeBridge(),
  reducedMotion = false,
  lowPerf = false
} = {}) {
  requireFunction(getCurrentScreen, 'getCurrentScreen');
  requireFunction(applyScreen, 'applyScreen');
  requireFunction(runVisualPhase, 'runVisualPhase');
  if (!navigationBridge || typeof navigationBridge.resolve !== 'function' || typeof navigationBridge.resolveBackTarget !== 'function') {
    throw new Error('navigationBridge must expose resolve and resolveBackTarget');
  }

  const director = createTransitionDirector({
    runPhase: async (phase, context) => {
      const motionProfile = resolveMotionProfile(context);
      await runVisualPhase(phase, Object.freeze({...context, motionProfile}));
    }
  });

  async function navigate(requestedTarget, {reason = 'navigation'} = {}) {
    const from = getCurrentScreen();
    const decision = navigationBridge.resolve(from, requestedTarget);
    if (!decision.ok) {
      return freezeTransitionResult({
        status: 'ignored',
        revision: director.getState().revision,
        from: decision.from,
        to: decision.to,
        swapped: false,
        reason: decision.reason
      });
    }

    const result = await director.start({
      from: decision.from,
      to: decision.to,
      reason,
      reducedMotion: readBoolean(reducedMotion),
      lowPerf: readBoolean(lowPerf),
      applySwap: (context) => {
        const applied = applyScreen(decision.to, Object.freeze({
          from: decision.from,
          to: decision.to,
          reason,
          revision: context.revision
        }));
        if (applied && typeof applied.then === 'function') {
          throw new Error('applyScreen must be synchronous');
        }
      }
    });

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
    getState: director.getState
  });
}
