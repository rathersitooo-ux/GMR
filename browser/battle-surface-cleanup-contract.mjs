const SCHEMA = 'gameroad.battle-surface-cleanup.v1';

const MODES = new Set(['PLAN', 'BATTLE_PHASE', 'RESULT']);

const RETIRED_SURFACES = Object.freeze([
  'visible-gameplay-logo',
  'visible-gameplay-wordmark',
  'giant-battle-brand-header',
  'match-info-dev-panel',
  'debug-coordinate-overlay',
  'debug-position-id-overlay',
  'full-109-cell-debug-grid',
  'fossil-same-field-battle-overlay',
  'raw-state-json-panel',
]);

const PRESERVED_STATUS_KEYS = Object.freeze([
  'round',
  'phase',
  'quickTimeRemainingMs',
  'hateValue',
  'manaPublic',
  'handCount',
  'deckCount',
  'shieldCount',
  'laneProgress',
  'commitState',
  'actorId',
  'targetId',
  'participantStatus',
  'honeyCount',
  'graveyardCount',
  'exileCount',
  'chipCount',
  'exCount',
]);

const PRESERVED_CONCEPTS = Object.freeze([
  'round',
  'phase',
  'quick-time',
  'hate',
  'mana',
  'hand-count',
  'deck-count',
  'shield',
  'lane-progress',
  'commit-state',
  'actor-target-relation',
  'participant-status',
  'honey',
  'graveyard-count',
  'exile-count',
  'chip',
  'ex',
]);

function pickPublicStatus(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const output = {};
  for (const key of PRESERVED_STATUS_KEYS) {
    if (Object.prototype.hasOwnProperty.call(input, key)) output[key] = input[key];
  }
  return output;
}

function layer(id, active, purpose, owner) {
  return Object.freeze({ id, active, purpose, owner });
}

function layersForMode(mode) {
  if (mode === 'PLAN') {
    return Object.freeze({
      world: layer('WORLD', true, 'field-and-public-world-state', 'branch-1-shell'),
      status: layer('STATUS', true, 'persistent-battle-status-host', 'branch-2-consumer'),
      decision: layer('DECISION', true, 'planning-and-targeting-host', 'branch-2-and-3-consumer'),
      causal: layer('CAUSAL', false, 'effect-chain-response-host', 'branch-4-consumer'),
      drawer: layer('DRAWER', false, 'detail-history-zone-host', 'branch-5-consumer'),
    });
  }
  if (mode === 'BATTLE_PHASE') {
    return Object.freeze({
      world: layer('WORLD', true, 'battle-presentation-stage', 'branch-7-consumer'),
      status: layer('STATUS', true, 'persistent-battle-status-host', 'branch-2-consumer'),
      decision: layer('DECISION', false, 'planning-shell-must-not-leak-into-battle-phase', 'branch-2-and-3-consumer'),
      causal: layer('CAUSAL', true, 'effect-chain-response-host-without-rule-semantics', 'branch-4-consumer'),
      drawer: layer('DRAWER', false, 'detail-history-zone-host', 'branch-5-consumer'),
    });
  }
  if (mode === 'RESULT') {
    return Object.freeze({
      world: layer('WORLD', false, 'board-world-not-required-by-result-shell', 'branch-1-shell'),
      status: layer('STATUS', true, 'result-summary-status-host', 'branch-8-consumer'),
      decision: layer('DECISION', false, 'planning-shell-must-not-leak-into-result', 'branch-2-and-3-consumer'),
      causal: layer('CAUSAL', false, 'active-chain-host-dormant-after-resolution', 'branch-4-consumer'),
      drawer: layer('DRAWER', true, 'result-history-and-detail-host', 'branch-5-and-8-consumer'),
    });
  }
  return Object.freeze({
    world: layer('WORLD', false, 'unknown-mode-safe-shell', 'branch-1-shell'),
    status: layer('STATUS', true, 'minimal-public-status-only', 'branch-1-shell'),
    decision: layer('DECISION', false, 'fail-closed', 'branch-1-shell'),
    causal: layer('CAUSAL', false, 'fail-closed', 'branch-1-shell'),
    drawer: layer('DRAWER', false, 'fail-closed', 'branch-1-shell'),
  });
}

/**
 * Presentation-only contract for retiring legacy Battle chrome without deleting
 * authoritative gameplay information. It intentionally does not mutate DOM,
 * calculate legality, resolve effects, or own browser/GAMEROAD.html.
 */
export function buildBattleSurfaceCleanupPlan({
  screenMode,
  legacySurface = {},
  publicStatus = {},
} = {}) {
  const requestedMode = typeof screenMode === 'string' ? screenMode.trim().toUpperCase() : '';
  const knownMode = MODES.has(requestedMode);
  const mode = knownMode ? requestedMode : 'UNKNOWN';

  return Object.freeze({
    schema: SCHEMA,
    ok: knownMode,
    reason: knownMode ? null : 'UNKNOWN_SCREEN_MODE',
    authority: 'presentation-read-only',
    mode,
    branding: Object.freeze({
      visibleGameplayLogo: 'omit',
      visibleGameplayWordmark: 'omit',
      visibleBrandHeader: 'omit',
      policy: 'hard-zero-visible-battle-branding',
    }),
    retire: RETIRED_SURFACES,
    preserve: PRESERVED_CONCEPTS,
    publicStatus: Object.freeze(pickPublicStatus(publicStatus)),
    legacySurfaceObserved: Object.freeze({
      hasDevPanel: Boolean(legacySurface?.hasDevPanel),
      hasDebugGrid: Boolean(legacySurface?.hasDebugGrid),
      hasVisibleBranding: Boolean(legacySurface?.hasVisibleBranding),
    }),
    layers: layersForMode(mode),
    causalContract: Object.freeze({
      hostReserved: true,
      effectSemanticsOwnedHere: false,
      responseRulesOwnedHere: false,
      priorityRulesOwnedHere: false,
      consumer: 'branch-4-effect-chain-response',
    }),
    integration: Object.freeze({
      requiresHtmlMount: true,
      ownedByThisModule: false,
      htmlPath: 'browser/GAMEROAD.html',
      htmlOwner: 'branch-9-integration',
    }),
    invariants: Object.freeze([
      'VISIBLE_GAMEPLAY_BRANDING_ZERO',
      'PRESERVE_GAMEPLAY_INFORMATION',
      'NO_GAME_RULE_CALCULATION',
      'NO_STATE_MUTATION',
      'NO_LEGALITY_INFERENCE',
      'NO_SECRET_FIELD_PASSTHROUGH',
      'NO_HTML_OWNERSHIP',
    ]),
  });
}

export const battleSurfaceCleanupContract = Object.freeze({
  schema: SCHEMA,
  retiredSurfaces: RETIRED_SURFACES,
  preservedStatusKeys: PRESERVED_STATUS_KEYS,
  preservedConcepts: PRESERVED_CONCEPTS,
});
