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
