const BOARD_SCHEMA = 'gameroad.battle-board-visual-explanation.v1';
const PARTNER_SCHEMA = 'gameroad.partner-advice-board-projection.v1';
const RULE_ROLES = Object.freeze([
  'current',
  'selected',
  'reachable',
  'path',
  'threat',
  'forecast',
  'honey',
  'target',
  'invalid',
]);
const AUTHORITY = Object.freeze({
  current: 'rules-derived',
  selected: 'rules-derived',
  reachable: 'rules-derived',
  path: 'rules-derived',
  threat: 'rules-derived',
  forecast: 'rules-derived',
  honey: 'rules-derived',
  target: 'rules-derived',
  invalid: 'rules-derived',
  'partner-recommendation': 'partner-heuristic',
});

function exactToken(value) {
  if (typeof value !== 'string') return null;
  if (!value || value.trim() !== value || value.length > 160) return null;
  return value;
}

function emptyChannels() {
  return Object.freeze({
    current: Object.freeze([]),
    selected: Object.freeze([]),
    reachable: Object.freeze([]),
    path: Object.freeze([]),
    threat: Object.freeze([]),
    forecast: Object.freeze([]),
    honey: Object.freeze([]),
    target: Object.freeze([]),
    invalid: Object.freeze([]),
  });
}

function inactiveRecommendation(clearReason = 'RECOMMENDATION_UNAVAILABLE') {
  return Object.freeze({
    active: false,
    clear: true,
    clearReason,
    targetId: null,
    candidateId: null,
    presentationRole: 'partner-recommendation',
    authority: 'partner-heuristic',
    autoExecute: false,
  });
}

function failed(reason) {
  return Object.freeze({
    schema: BOARD_SCHEMA,
    ok: false,
    clear: true,
    reason,
    channels: emptyChannels(),
    recommendation: inactiveRecommendation(reason),
    rolesByPosition: Object.freeze({}),
    authorityByRole: AUTHORITY,
  });
}

function normalizeValidPositions(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const ordered = [];
  const seen = new Set();
  for (const raw of values) {
    const id = exactToken(raw);
    if (!id) return null;
    if (!seen.has(id)) {
      seen.add(id);
      ordered.push(id);
    }
  }
  return ordered.length ? Object.freeze(ordered) : null;
}

function canonicalSetList(values, validSet, canonicalIndex) {
  if (values == null) return Object.freeze([]);
  if (!Array.isArray(values)) throw new Error('INVALID_POSITION_LIST');
  const deduped = new Set();
  for (const raw of values) {
    const id = exactToken(raw);
    if (!id || !validSet.has(id)) throw new Error('UNKNOWN_POSITION_ID');
    deduped.add(id);
  }
  return Object.freeze([...deduped].sort((a, b) => canonicalIndex.get(a) - canonicalIndex.get(b)));
}

function orderedPath(values, validSet) {
  if (values == null) return Object.freeze([]);
  if (!Array.isArray(values)) throw new Error('INVALID_POSITION_LIST');
  const seen = new Set();
  const out = [];
  for (const raw of values) {
    const id = exactToken(raw);
    if (!id || !validSet.has(id)) throw new Error('UNKNOWN_POSITION_ID');
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return Object.freeze(out);
}

function singleton(raw, validSet) {
  if (raw == null) return Object.freeze([]);
  const id = exactToken(raw);
  if (!id || !validSet.has(id)) throw new Error('UNKNOWN_POSITION_ID');
  return Object.freeze([id]);
}

function recommendationFromPartner(partnerProjection, validSet) {
  if (!partnerProjection || typeof partnerProjection !== 'object' || Array.isArray(partnerProjection)) {
    return inactiveRecommendation('RECOMMENDATION_UNAVAILABLE');
  }
  if (partnerProjection.schema !== PARTNER_SCHEMA) return inactiveRecommendation('RECOMMENDATION_SCHEMA_MISMATCH');
  if (partnerProjection.active !== true || partnerProjection.clear === true) return inactiveRecommendation('RECOMMENDATION_INACTIVE');
  if (partnerProjection.presentationRole !== 'partner-recommendation') return inactiveRecommendation('RECOMMENDATION_ROLE_MISMATCH');
  if (partnerProjection.autoExecute !== false) return inactiveRecommendation('RECOMMENDATION_AUTOEXECUTE_FORBIDDEN');

  const targetId = exactToken(partnerProjection.targetId);
  if (!targetId || !validSet.has(targetId)) return inactiveRecommendation('RECOMMENDATION_TARGET_UNMAPPED');

  return Object.freeze({
    active: true,
    clear: false,
    clearReason: null,
    targetId,
    candidateId: exactToken(partnerProjection.candidateId),
    presentationRole: 'partner-recommendation',
    authority: 'partner-heuristic',
    autoExecute: false,
  });
}

function buildRolesByPosition(validPositions, channels, recommendation) {
  const map = {};
  for (const id of validPositions) {
    const roles = [];
    for (const role of RULE_ROLES) {
      if (channels[role].includes(id)) roles.push(role);
    }
    if (recommendation.active && recommendation.targetId === id) roles.push('partner-recommendation');
    if (roles.length) map[id] = Object.freeze(roles);
  }
  return Object.freeze(map);
}

/**
 * Produces semantic presentation roles only. It does not infer legality, mutate game state,
 * choose a move, decide where honey may be collected, or encode any visual skin.
 *
 * `honeyPositionIds`, `targetPositionIds`, and `invalidPositionIds` must therefore come from
 * authoritative game state/rules. This module only validates and projects those meanings.
 */
export function projectBattleBoardVisualExplanation({
  validPositionIds,
  currentPositionId = null,
  selectedPositionId = null,
  reachablePositionIds = [],
  pathPositionIds = [],
  threatPositionIds = [],
  forecastPositionIds = [],
  honeyPositionIds = [],
  targetPositionIds = [],
  invalidPositionIds = [],
  partnerProjection = null,
  revisionToken = null,
  currentRevisionToken = null,
} = {}) {
  const validPositions = normalizeValidPositions(validPositionIds);
  if (!validPositions) return failed('NO_VALID_POSITIONS');

  if (revisionToken != null || currentRevisionToken != null) {
    const revision = exactToken(revisionToken);
    const currentRevision = exactToken(currentRevisionToken);
    if (!revision || !currentRevision || revision !== currentRevision) return failed('STALE_BOARD_STATE');
  }

  const validSet = new Set(validPositions);
  const canonicalIndex = new Map(validPositions.map((id, index) => [id, index]));

  let channels;
  try {
    channels = Object.freeze({
      current: singleton(currentPositionId, validSet),
      selected: singleton(selectedPositionId, validSet),
      reachable: canonicalSetList(reachablePositionIds, validSet, canonicalIndex),
      path: orderedPath(pathPositionIds, validSet),
      threat: canonicalSetList(threatPositionIds, validSet, canonicalIndex),
      forecast: canonicalSetList(forecastPositionIds, validSet, canonicalIndex),
      honey: canonicalSetList(honeyPositionIds, validSet, canonicalIndex),
      target: canonicalSetList(targetPositionIds, validSet, canonicalIndex),
      invalid: canonicalSetList(invalidPositionIds, validSet, canonicalIndex),
    });
  } catch (error) {
    return failed(error?.message === 'INVALID_POSITION_LIST' ? 'INVALID_POSITION_LIST' : 'UNKNOWN_POSITION_ID');
  }

  const recommendation = recommendationFromPartner(partnerProjection, validSet);
  const rolesByPosition = buildRolesByPosition(validPositions, channels, recommendation);

  return Object.freeze({
    schema: BOARD_SCHEMA,
    ok: true,
    clear: false,
    reason: null,
    channels,
    recommendation,
    rolesByPosition,
    authorityByRole: AUTHORITY,
  });
}
