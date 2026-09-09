const SCHEMA = 'GAMEROAD_BATTLE_PORTRAIT_RECOMPOSE_PRESENTATION_V1';

const TARGET_WIDTH = 390;
const TARGET_HEIGHT = 844;
const PHONE_PORTRAIT_MAX_WIDTH = 540;
const MIN_TOUCH_TARGET_PX = 44;

export const BATTLE_PORTRAIT_REGION = Object.freeze({
  TOP_HUD: 'TOP_HUD',
  PUBLIC_STATUS: 'PUBLIC_STATUS',
  WORLD_VIEWPORT: 'WORLD_VIEWPORT',
  CURRENT_ACTION: 'CURRENT_ACTION',
  INTERACTION_DOCK: 'INTERACTION_DOCK',
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function requireFinitePositive(value, name) {
  if (!Number.isFinite(value) || value <= 0) throw new TypeError(`${name} must be a positive finite number`);
  return value;
}

function requireBoolean(value, name) {
  if (typeof value !== 'boolean') throw new TypeError(`${name} must be boolean`);
  return value;
}

function normalizeInset(value, name) {
  if (value == null) return 0;
  if (!Number.isFinite(value) || value < 0) throw new TypeError(`${name} must be a non-negative finite number`);
  return Math.round(value);
}

function normalizeSafeInsets(safeInsets = {}) {
  if (!safeInsets || typeof safeInsets !== 'object' || Array.isArray(safeInsets)) {
    throw new TypeError('safeInsets must be an object');
  }
  return Object.freeze({
    top: normalizeInset(safeInsets.top, 'safeInsets.top'),
    right: normalizeInset(safeInsets.right, 'safeInsets.right'),
    bottom: normalizeInset(safeInsets.bottom, 'safeInsets.bottom'),
    left: normalizeInset(safeInsets.left, 'safeInsets.left'),
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function rounded(value) {
  return Math.round(value);
}

function region(name, top, bottom, extra = {}) {
  return {
    name,
    topPx: top,
    bottomPx: bottom,
    heightPx: Math.max(0, bottom - top),
    ...extra,
  };
}

function motionMode({ reducedMotion, lowPerformance }) {
  if (lowPerformance) return 'LOW_PERF_STATIC';
  if (reducedMotion) return 'REDUCED_STATIC';
  return 'FULL';
}

/**
 * Builds a screen-space composition plan for phone portrait Battle.
 *
 * The plan intentionally does not place FIELD nodes, Shield/progression/GOAL,
 * the operation character, legal targets, or cards in world space. Those
 * remain owned by the existing Battle/world authorities. The only purpose of
 * this module is to reserve and prioritize screen-space surfaces so a 390x844
 * presentation can be wired into the existing runtimes without inventing a
 * second Battle/input engine.
 */
export function projectBattlePortraitRecompose({
  viewportWidth = TARGET_WIDTH,
  viewportHeight = TARGET_HEIGHT,
  safeInsets = {},
  participantCount = 4,
  optionalRouletteEnabled = false,
  optionalDiceEnabled = false,
  adviceExpanded = false,
  reducedMotion = false,
  lowPerformance = false,
} = {}) {
  const width = rounded(requireFinitePositive(viewportWidth, 'viewportWidth'));
  const height = rounded(requireFinitePositive(viewportHeight, 'viewportHeight'));
  const insets = normalizeSafeInsets(safeInsets);
  requireBoolean(optionalRouletteEnabled, 'optionalRouletteEnabled');
  requireBoolean(optionalDiceEnabled, 'optionalDiceEnabled');
  requireBoolean(adviceExpanded, 'adviceExpanded');
  requireBoolean(reducedMotion, 'reducedMotion');
  requireBoolean(lowPerformance, 'lowPerformance');
  if (participantCount !== 4) throw new RangeError('participantCount must be 4 for the current 2v2 Battle presentation');

  const contentWidth = width - insets.left - insets.right;
  const contentHeight = height - insets.top - insets.bottom;
  if (contentWidth <= 0 || contentHeight <= 0) throw new RangeError('safeInsets leave no visible viewport');

  const isPhonePortrait = width <= PHONE_PORTRAIT_MAX_WIDTH && height > width;
  const exactTarget = width === TARGET_WIDTH && height === TARGET_HEIGHT;
  const mode = motionMode({ reducedMotion, lowPerformance });

  if (!isPhonePortrait) {
    return deepFreeze({
      schema: SCHEMA,
      applicable: false,
      exactTarget,
      viewport: { width, height, safeInsets: insets },
      reason: 'NOT_PHONE_PORTRAIT',
      gameplayAuthority: false,
      worldGeometryAuthority: false,
      cameraAuthority: false,
      inputAuthority: false,
      legalityAuthority: false,
      handAssignmentAuthority: false,
      gameStateWrite: false,
    });
  }

  // Independent recomposition: each band is derived from its job, not by
  // uniformly scaling a landscape rectangle. At the 390x844 acceptance target
  // these resolve to 56px HUD, 52px 4P rail, 488px world viewport, and a 260px
  // lower interaction dock with a small intentional overlap at the world edge.
  const topHudHeight = clamp(rounded(contentHeight * 0.066), 52, 60);
  const publicStatusHeight = clamp(rounded(contentHeight * 0.062), 48, 56);
  const interactionDockHeight = clamp(rounded(contentHeight * 0.308), 236, 268);
  const worldDockOverlap = clamp(rounded(contentHeight * 0.014), 10, 14);
  const currentActionHeight = clamp(rounded(contentHeight * 0.066), 50, 60);

  const contentTop = insets.top;
  const contentBottom = height - insets.bottom;
  const topHudBottom = contentTop + topHudHeight;
  const publicStatusBottom = topHudBottom + publicStatusHeight;
  const interactionDockTop = contentBottom - interactionDockHeight;
  const worldBottom = Math.min(contentBottom, interactionDockTop + worldDockOverlap);
  const currentActionBottom = Math.min(worldBottom, interactionDockTop + worldDockOverlap);
  const currentActionTop = Math.max(publicStatusBottom, currentActionBottom - currentActionHeight);

  if (worldBottom <= publicStatusBottom) throw new RangeError('viewport is too short for portrait Battle recomposition');

  const horizontalInset = Math.max(8, insets.left, insets.right);
  const publicGap = 4;
  const publicUsableWidth = Math.max(0, width - horizontalInset * 2 - publicGap * 3);
  const publicTileWidth = Math.floor(publicUsableWidth / 4);

  const regions = {
    topHud: region(BATTLE_PORTRAIT_REGION.TOP_HUD, contentTop, topHudBottom, {
      placement: 'TOP_SCREEN_SPACE',
      requiredItems: ['settings', 'turn', 'score', 'battleCardChain', 'loadCardJanken', 'hate'],
      valuePolicy: 'CALLER_AUTHORITATIVE_ONLY',
      overflowPolicy: 'COMPACT_HORIZONTAL_NO_SECOND_HUD',
    }),
    publicStatus: region(BATTLE_PORTRAIT_REGION.PUBLIC_STATUS, topHudBottom, publicStatusBottom, {
      placement: 'TOP_PERIPHERAL_RAIL',
      columns: 4,
      rows: 1,
      gapPx: publicGap,
      tileWidthPx: publicTileWidth,
      essentials: ['identity', 'team', 'currentActor', 'shieldLCR'],
      contextual: ['role', 'publicAfterstate'],
      decorativeCenter: false,
    }),
    worldViewport: region(BATTLE_PORTRAIT_REGION.WORLD_VIEWPORT, publicStatusBottom, worldBottom, {
      placement: 'PRIMARY_WORLD_SURFACE',
      priority: 1,
      operationCharacter: 'WORLD_SPACE_AUTHORITATIVE_POSITION',
      shieldProgressGoal: 'WORLD_SPACE_INSPECTABLE',
      camera: 'EXISTING_FOLLOW_AND_INSPECT_AUTHORITY',
      fieldThemeBinding: 'DECORATION_SEPARATE_FROM_GAMEPLAY_GEOMETRY',
    }),
    currentAction: region(BATTLE_PORTRAIT_REGION.CURRENT_ACTION, currentActionTop, currentActionBottom, {
      placement: 'WORLD_TO_DOCK_BOUNDARY_OVERLAY',
      priority: 2,
      blocksWorldInput: false,
      valuePolicy: 'CALLER_AUTHORITATIVE_ONLY',
    }),
    interactionDock: region(BATTLE_PORTRAIT_REGION.INTERACTION_DOCK, interactionDockTop, contentBottom, {
      placement: 'BOTTOM_SCREEN_SPACE',
      priority: 2,
      primaryAnchor: 'BOTTOM_RIGHT_THUMB_CLUSTER',
      minimumTouchTargetPx: MIN_TOUCH_TARGET_PX,
      jankenChoiceCount: 3,
      thumbGeometryAuthority: 'BATTLE_THUMB_CLUSTER_PRESENTATION_R1',
      handProjectionAuthority: 'EXISTING_HAND3_AND_JANKEN_RUNTIME',
    }),
  };

  const worldIsLargest = regions.worldViewport.heightPx > regions.interactionDock.heightPx
    && regions.worldViewport.heightPx > regions.topHud.heightPx
    && regions.worldViewport.heightPx > regions.publicStatus.heightPx;

  return deepFreeze({
    schema: SCHEMA,
    applicable: true,
    exactTarget,
    viewport: { width, height, safeInsets: insets },
    profile: exactTarget ? 'PHONE_PORTRAIT_390x844' : 'PHONE_PORTRAIT_RECOMPOSED',
    motionMode: mode,
    regions,
    hierarchy: [
      'WORLD_VIEWPORT',
      'CURRENT_ACTION',
      'OWN_HAND_JANKEN',
      'PUBLIC_4P_STATUS',
      'RECENT_HISTORY_DETAIL',
    ],
    worldIsLargest,

    advice: {
      actorSeparation: 'ADVICE_PARTNER_SEPARATE_FROM_OPERATION_CHARACTER',
      presentation: adviceExpanded ? 'EXPLICIT_EXPANDED_EXISTING_SURFACE' : 'COMPACT_TRIGGER_AT_WORLD_EDGE',
      defaultCompact: !adviceExpanded,
      defaultBlocksWorld: false,
    },
    optionalRules: {
      roulette: optionalRouletteEnabled
        ? { visible: true, placement: 'BOTTOM_RIGHT_THUMB_CLUSTER_EXTENSION' }
        : { visible: false, placement: 'ABSENT' },
      dice: optionalDiceEnabled
        ? { visible: true, placement: 'WORLD_ACTION_EDGE_AUXILIARY' }
        : { visible: false, placement: 'ABSENT' },
    },
    causality: {
      fullScreenResolutionModal: false,
      keepBoardVisible: true,
      returnDestinationAuthority: 'EXISTING_BATTLE_AUTHORITY',
      processingOrderAuthority: 'EXISTING_ACTION_ORDER_AUTHORITY',
    },

    // Explicit non-authority boundary for safe later runtime composition.
    gameplayAuthority: false,
    worldGeometryAuthority: false,
    cameraAuthority: false,
    inputAuthority: false,
    legalityAuthority: false,
    targetAuthority: false,
    shieldAuthority: false,
    progressAuthority: false,
    goalAuthority: false,
    handAssignmentAuthority: false,
    manaRecoveryAuthority: false,
    hiddenHandAuthority: false,
    optionalRuleEnableAuthority: false,
    gameStateWrite: false,
  });
}

export function isBattlePortraitRecomposePlan(value) {
  return Boolean(
    value
      && typeof value === 'object'
      && !Array.isArray(value)
      && value.schema === SCHEMA
      && typeof value.applicable === 'boolean'
      && value.gameplayAuthority === false
      && value.worldGeometryAuthority === false
      && value.inputAuthority === false
      && value.legalityAuthority === false
      && value.handAssignmentAuthority === false
      && value.gameStateWrite === false
  );
}

export const BATTLE_PORTRAIT_RECOMPOSE_CONTRACT = deepFreeze({
  schema: SCHEMA,
  targetViewport: { width: TARGET_WIDTH, height: TARGET_HEIGHT },
  phonePortraitMaxWidth: PHONE_PORTRAIT_MAX_WIDTH,
  minimumTouchTargetPx: MIN_TOUCH_TARGET_PX,
  participantCount: 4,
  recomposesInsteadOfScalingLandscape: true,
  worldMustRemainLargestPrimarySurface: true,
  publicStatusDisposition: 'FOUR_COLUMN_COMPACT_PERIPHERAL_RAIL',
  operationCharacterDisposition: 'WORLD_SPACE_EXISTING_AUTHORITY',
  advicePartnerDisposition: 'SEPARATE_COMPACT_BY_DEFAULT',
  thumbClusterDisposition: 'BOTTOM_RIGHT_EXISTING_AUTHORITY',
  basicBattleRouletteVisible: false,
  basicBattleDiceVisible: false,
  movesWorldObjects: false,
  computesCamera: false,
  computesTargets: false,
  computesLegality: false,
  computesHandAssignment: false,
  computesManaRecovery: false,
  computesHiddenHand: false,
  enablesOptionalRules: false,
  writesGameState: false,
});
