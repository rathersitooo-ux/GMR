const SCHEMA = 'gameroad.battle-board-legacy-world-interaction-adapter.v1';
const ROAD_RE = /^R:(P[1-4]):([LCR]):([1-7])$/;
const SHIELD_RE = /^S:(P[1-4]):([LCR])$/;
const CENTER_RE = /^C:(-1|0|1):(-1|0|1)$/;
const CORNER_RE = /^K:(NW|NE|SW|SE)$/;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function normalizeOptionalId(value, code) {
  if (value == null) return null;
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(code);
  return value;
}

function normalizeIdList(value, code) {
  if (!Array.isArray(value)) throw new TypeError(code);
  const out = [];
  const seen = new Set();
  for (const id of value) {
    if (typeof id !== 'string' || id.length === 0) throw new TypeError(code);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function mapLegacyRoadPositionToWorldNodeId(authorityPositionId) {
  const match = typeof authorityPositionId === 'string' ? ROAD_RE.exec(authorityPositionId) : null;
  if (!match) return null;
  const [, participantId, lane, depthText] = match;
  const legacyDepth = Number(depthText);
  const stageIndex = 8 - legacyDepth;
  return deepFreeze({
    authorityPositionId,
    nodeId: `upper:${participantId}:${lane}:${stageIndex}`,
    participantId,
    lane,
    legacyDepth,
    stageIndex,
    mappingBasis: 'EXACT_TOPOLOGY_REVERSED_SHIELD_TO_GOAL_ORDER',
    presentationOnly: true,
    semanticInference: false,
    gameplayAuthority: false,
    movementAuthority: false,
    legalityAuthority: false,
  });
}

function classifyUnmapped(authorityPositionId) {
  if (SHIELD_RE.test(authorityPositionId)) return 'LEGACY_SHIELD_IS_STOPPABLE_BUT_NEW_SHIELD_IS_NONSTOPPABLE';
  if (CENTER_RE.test(authorityPositionId) || CORNER_RE.test(authorityPositionId)) {
    return 'LOWER_SHARED_FIELD_MAPPING_UNRESOLVED_NO_INFERENCE';
  }
  return 'LEGACY_AUTHORITY_POSITION_ID_INVALID';
}

function projectOne(authorityPositionId, role, unresolved) {
  if (authorityPositionId == null) return null;
  const road = mapLegacyRoadPositionToWorldNodeId(authorityPositionId);
  if (road) return road.nodeId;
  unresolved.push(deepFreeze({ authorityPositionId, role, reason: classifyUnmapped(authorityPositionId) }));
  return null;
}

export function projectLegacyWorldInteractionSnapshot({
  currentPositionId = null,
  reachablePositionIds = [],
  pathPositionIds = [],
  nextPositionId = null,
} = {}) {
  const current = normalizeOptionalId(currentPositionId, 'LEGACY_WORLD_CURRENT_POSITION_INVALID');
  const next = normalizeOptionalId(nextPositionId, 'LEGACY_WORLD_NEXT_POSITION_INVALID');
  const reachable = normalizeIdList(reachablePositionIds, 'LEGACY_WORLD_REACHABLE_POSITIONS_INVALID');
  const path = normalizeIdList(pathPositionIds, 'LEGACY_WORLD_PATH_POSITIONS_INVALID');
  const unresolved = [];
  const currentNodeId = projectOne(current, 'CURRENT', unresolved);
  const nextNodeId = projectOne(next, 'NEXT', unresolved);
  const reachableNodeIds = reachable.map((id) => projectOne(id, 'REACHABLE', unresolved)).filter(Boolean);
  const pathNodeIds = path.map((id) => projectOne(id, 'PATH', unresolved)).filter(Boolean);
  const invalid = unresolved.filter((entry) => entry.reason === 'LEGACY_AUTHORITY_POSITION_ID_INVALID');
  const complete = unresolved.length === 0;

  return deepFreeze({
    schema: SCHEMA,
    canonicalOverlayInput: {
      currentNodeId,
      reachableNodeIds,
      pathNodeIds,
      nextNodeId,
    },
    unresolved,
    invalid,
    complete,
    safeToSuppressLegacyBoardVisuals: complete,
    presentationOnly: true,
    semanticInference: false,
    computesMovementLegality: false,
    computesTargetLegality: false,
    gameplayAuthority: false,
    movementAuthority: false,
    legalityAuthority: false,
    stateWrite: false,
  });
}

export const BATTLE_BOARD_LEGACY_WORLD_INTERACTION_ADAPTER_CONTRACT = deepFreeze({
  schema: SCHEMA,
  mappedLegacyKinds: ['ROAD'],
  legacyRoadOrientation: 'DEPTH_1_AT_SHIELD_TO_STAGE_7_AT_GATE',
  legacyShieldMapping: 'BLOCKED_STOPPABILITY_MISMATCH',
  legacyCenterCornerMapping: 'UNRESOLVED_NO_INFERENCE',
  outputTarget: 'BATTLE_BOARD_WORLD_INTERACTION_OVERLAY_INPUT',
  safeLegacyVisualSuppressionRequiresCompleteMapping: true,
  presentationOnly: true,
  semanticInference: false,
  computesMovementLegality: false,
  computesTargetLegality: false,
  gameplayAuthority: false,
  movementAuthority: false,
  legalityAuthority: false,
  stateWrite: false,
});
