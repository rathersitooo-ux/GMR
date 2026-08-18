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

  return {
    ok: true,
    from: currentScreen,
    to: requestedTarget,
    reason: SCREEN_NAVIGATION_REASON.NAVIGATE
  };
}

export function resolveScreenBackTarget(currentScreen, historyEntry) {
  return historyEntry?.screen
    || SCREEN_NAVIGATION_FALLBACK_PARENT[currentScreen]
    || 'home';
}
