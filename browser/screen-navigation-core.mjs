export const SCREEN_NAVIGATION_REASON = Object.freeze({
  EMPTY_TARGET: 'EMPTY_TARGET',
  CURRENT_SCREEN: 'CURRENT_SCREEN',
  NAVIGATE: 'NAVIGATE'
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
