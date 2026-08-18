import { resolveScreenNavigation } from './screen-navigation-core.mjs';

export const SCREEN_NAVIGATION_BRIDGE_KEY = 'GAMEROAD_SCREEN_NAVIGATION';

export function createScreenNavigationBridge() {
  return Object.freeze({ resolve: resolveScreenNavigation });
}

export function installScreenNavigationBridge(target = globalThis) {
  const existing = target[SCREEN_NAVIGATION_BRIDGE_KEY];
  if (existing) {
    if (existing.resolve !== resolveScreenNavigation) {
      throw new Error(`${SCREEN_NAVIGATION_BRIDGE_KEY} is already occupied by an incompatible bridge`);
    }
    return existing;
  }

  const bridge = createScreenNavigationBridge();
  Object.defineProperty(target, SCREEN_NAVIGATION_BRIDGE_KEY, {
    value: bridge,
    enumerable: false,
    configurable: false,
    writable: false
  });
  return bridge;
}

installScreenNavigationBridge();
