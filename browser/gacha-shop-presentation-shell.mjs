import {
  applyGachaPresentationEvent,
  createGachaPresentation,
  projectGachaPresentation,
} from './gacha-presentation-core.mjs';
import {
  projectShopTransactionPresentation,
  projectVerifiedCommerceEventBoundary,
} from './shop-transaction-presentation-adapter.mjs';

export const GACHA_SHOP_PRESENTATION_SHELL_SCHEMA = 'gameroad.gacha-shop-presentation-shell.v1';

const SCREENS = new Set(['GACHA_IDLE', 'GACHA_RESULT', 'GACHA_SKIP', 'SHOP']);
const SHOP_MODES = new Set(['PRESENTATION_PHASE', 'VERIFIED_COMMERCE_EVENT']);

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requirePlainObject(value, label) {
  if (!isPlainObject(value)) throw new Error(`${label} must be a plain object`);
  return value;
}

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function cloneJson(value, label = 'value') {
  if (value === undefined) throw new Error(`${label} must be JSON-safe`);
  try {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error('not serializable');
    return JSON.parse(encoded);
  } catch {
    throw new Error(`${label} must be JSON-safe`);
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function normalizeIdleAssets(assets = {}) {
  requirePlainObject(assets, 'idle.assets');
  return Object.freeze({
    character: assets.character === 'formal' ? 'formal' : 'fallback',
    video: assets.video === 'formal' ? 'formal' : 'fallback',
  });
}

function idleEffects({ reducedMotion = false, lowPerf = false, video = 'fallback' } = {}) {
  if (Boolean(reducedMotion)) return Object.freeze({ motion: 'still', video: 'disabled' });
  if (Boolean(lowPerf)) return Object.freeze({ motion: 'short_fade', video: 'disabled' });
  return Object.freeze({ motion: 'full', video: video === 'formal' ? 'enabled' : 'fallback' });
}

function authorityBoundary(kind) {
  return Object.freeze({
    source: kind,
    resultAuthority: false,
    transactionAuthority: false,
    grantAuthority: false,
    ownershipMutationAllowed: false,
    saveMutationAllowed: false,
  });
}

function projectGachaIdle(idle = {}) {
  requirePlainObject(idle, 'idle');
  const assets = normalizeIdleAssets(idle.assets ?? {});
  const reducedMotion = Boolean(idle.reducedMotion);
  const lowPerf = Boolean(idle.lowPerf);
  return deepFreeze({
    stage: 'idle',
    resultIdentity: null,
    currentResult: null,
    revealedResults: [],
    resultCount: 0,
    accessibility: { reducedMotion, lowPerf },
    assets,
    effects: idleEffects({ reducedMotion, lowPerf, video: assets.video }),
  });
}

function projectGachaAuthorityPath(gacha, screen) {
  requirePlainObject(gacha, 'gacha');
  requireNonEmptyString(gacha.presentationId, 'gacha.presentationId');
  requireNonEmptyString(gacha.resultIdentity, 'gacha.resultIdentity');
  if (!Array.isArray(gacha.resultBundle) || gacha.resultBundle.length === 0) {
    throw new Error('gacha.resultBundle must be a non-empty ordered array');
  }
  if (!Array.isArray(gacha.events) || gacha.events.length === 0) {
    throw new Error('gacha.events must be a non-empty ordered array');
  }

  let state = createGachaPresentation({
    presentationId: gacha.presentationId,
    resultIdentity: gacha.resultIdentity,
    resultBundle: gacha.resultBundle,
    reducedMotion: gacha.reducedMotion,
    lowPerf: gacha.lowPerf,
    assets: gacha.assets,
  });

  let sawSkip = false;
  for (const rawEvent of gacha.events) {
    requirePlainObject(rawEvent, 'gacha event');
    const event = cloneJson(rawEvent, 'gacha event');
    if (event.type === 'SKIP') sawSkip = true;
    state = applyGachaPresentationEvent(state, event);
  }

  const projection = projectGachaPresentation(state);
  if (screen === 'GACHA_RESULT' && projection.currentResult == null) {
    throw new Error('GACHA_RESULT requires at least one caller-authorized reveal');
  }
  if (screen === 'GACHA_SKIP' && (!sawSkip || projection.stage !== 'completed')) {
    throw new Error('GACHA_SKIP requires a caller-supplied SKIP event reaching completed');
  }
  return projection;
}

function projectShop(shop) {
  requirePlainObject(shop, 'shop');
  const mode = requireNonEmptyString(shop.mode, 'shop.mode');
  if (!SHOP_MODES.has(mode)) throw new Error(`unsupported Shop shell mode: ${mode}`);

  if (mode === 'PRESENTATION_PHASE') {
    requirePlainObject(shop.input, 'shop.input');
    return projectShopTransactionPresentation(cloneJson(shop.input, 'shop.input'));
  }

  requirePlainObject(shop.input, 'shop.input');
  return projectVerifiedCommerceEventBoundary({
    ...shop.input,
    event: cloneJson(shop.input.event, 'shop.input.event'),
  });
}

/**
 * Pure screen-level presentation projection for Branch 7.
 *
 * Authority boundary:
 * - GACHA_IDLE does not require or create a result identity.
 * - GACHA_RESULT / GACHA_SKIP require caller-supplied authoritative resultIdentity,
 *   ordered resultBundle, and caller-supplied presentation event identities/sequences.
 * - SHOP delegates transaction truth to the existing Shop presentation/verified-commerce adapters.
 * - This shell never pulls, purchases, prices, grants, saves, creates ownership, or invents result truth.
 */
export function createGachaShopPresentationShell(input = {}) {
  requirePlainObject(input, 'input');
  const screen = requireNonEmptyString(input.screen, 'screen');
  if (!SCREENS.has(screen)) throw new Error(`unsupported Branch7 presentation screen: ${screen}`);

  if (screen === 'GACHA_IDLE') {
    return deepFreeze({
      schema: GACHA_SHOP_PRESENTATION_SHELL_SCHEMA,
      screen,
      authority: authorityBoundary('presentation_only'),
      presentation: projectGachaIdle(input.idle ?? {}),
    });
  }

  if (screen === 'GACHA_RESULT' || screen === 'GACHA_SKIP') {
    return deepFreeze({
      schema: GACHA_SHOP_PRESENTATION_SHELL_SCHEMA,
      screen,
      authority: authorityBoundary('caller_authoritative_gacha_result'),
      presentation: projectGachaAuthorityPath(input.gacha, screen),
    });
  }

  return deepFreeze({
    schema: GACHA_SHOP_PRESENTATION_SHELL_SCHEMA,
    screen,
    authority: authorityBoundary('existing_shop_authority_projection'),
    presentation: projectShop(input.shop),
  });
}

export const GACHA_SHOP_PRESENTATION_SCREENS = Object.freeze([...SCREENS]);
export const GACHA_SHOP_PRESENTATION_SHOP_MODES = Object.freeze([...SHOP_MODES]);
