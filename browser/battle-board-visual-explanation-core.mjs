const BOARD_SCHEMA = 'gameroad.battle-board-visual-explanation.v1';
const PARTNER_SCHEMA = 'gameroad.partner-advice-board-projection.v1';
const POSITION_KINDS = Object.freeze(['central', 'road', 'shield', 'corner']);
const RULE_ROLES = Object.freeze([
  'current',
  'selected',
  'reachable',
  'path',
  'undo',
  'threat',
  'forecast',
  'honey',
  'honey-collectable',
  'target',
  'win-frontier',
  'invalid',
]);
const AUTHORITY = Object.freeze({
  current: 'rules-derived',
  selected: 'rules-derived',
  reachable: 'rules-derived',
  path: 'rules-derived',
  undo: 'rules-derived',
  threat: 'rules-derived',
  forecast: 'rules-derived',
  honey: 'rules-derived',
  'honey-collectable': 'rules-derived',
  target: 'rules-derived',
  'win-frontier': 'rules-derived',
  invalid: 'rules-derived',
  'position-kind': 'rules-derived',
  'invalid-reason': 'rules-derived',
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
    undo: Object.freeze([]),
    threat: Object.freeze([]),
    forecast: Object.freeze([]),
    honey: Object.freeze([]),
    'honey-collectable': Object.freeze([]),
    target: Object.freeze([]),
    'win-frontier': Object.freeze([]),
    invalid: Object.freeze([]),
  });
}

function emptyAnnotations() {
  return Object.freeze({
    positionKindByPosition: Object.freeze({}),
    invalidReasonByPosition: Object.freeze({}),
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
    annotations: emptyAnnotations(),
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

function canonicalAnnotationMap(raw, validPositions, validSet, validateValue, invalidReason) {
  if (raw == null) return Object.freeze({});
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new Error(invalidReason);
  const out = {};
  for (const id of validPositions) {
    if (!Object.prototype.hasOwnProperty.call(raw, id)) continue;
    if (!validSet.has(id)) throw new Error('UNKNOWN_POSITION_ID');
    const value = validateValue(raw[id]);
    if (value == null) throw new Error(invalidReason);
    out[id] = value;
  }
  for (const rawId of Object.keys(raw)) {
    const id = exactToken(rawId);
    if (!id || !validSet.has(id)) throw new Error('UNKNOWN_POSITION_ID');
  }
  return Object.freeze(out);
}

function positionKinds(raw, validPositions, validSet) {
  const allowed = new Set(POSITION_KINDS);
  return canonicalAnnotationMap(
    raw,
    validPositions,
    validSet,
    (value) => (typeof value === 'string' && allowed.has(value) ? value : null),
    'INVALID_POSITION_KIND',
  );
}

function invalidReasons(raw, validPositions, validSet, invalidPositionSet) {
  const out = canonicalAnnotationMap(
    raw,
    validPositions,
    validSet,
    (value) => exactToken(value),
    'INVALID_INVALID_REASON',
  );
  for (const id of Object.keys(out)) {
    if (!invalidPositionSet.has(id)) throw new Error('INVALID_REASON_WITHOUT_INVALID_ROLE');
  }
  return out;
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
 * choose a move, decide where honey may be collected, decide what constitutes a winning lane,
 * parse position ids into board topology, or encode any visual skin.
 *
 * All rules-derived inputs must therefore come from authoritative game state/rules. In particular:
 * - `honeyPositionIds` means honey is present.
 * - `honeyCollectablePositionIds` means honey can be collected at the current decision point.
 * - `undoPositionId` identifies the authoritative one-step-back destination, if any.
 * - `winFrontierPositionIds` identifies authoritative victory-frontier positions.
 * - `positionKindByPosition` is caller-supplied topology metadata (`central|road|shield|corner`);
 *   this module never guesses kind from the id string.
 * - `invalidReasonByPosition` is caller-supplied reason metadata and may annotate only positions
 *   already present in `invalidPositionIds`.
 */
export function projectBattleBoardVisualExplanation({
  validPositionIds,
  currentPositionId = null,
  selectedPositionId = null,
  reachablePositionIds = [],
  pathPositionIds = [],
  undoPositionId = null,
  threatPositionIds = [],
  forecastPositionIds = [],
  honeyPositionIds = [],
  honeyCollectablePositionIds = [],
  targetPositionIds = [],
  winFrontierPositionIds = [],
  invalidPositionIds = [],
  positionKindByPosition = null,
  invalidReasonByPosition = null,
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
  let annotations;
  try {
    channels = Object.freeze({
      current: singleton(currentPositionId, validSet),
      selected: singleton(selectedPositionId, validSet),
      reachable: canonicalSetList(reachablePositionIds, validSet, canonicalIndex),
      path: orderedPath(pathPositionIds, validSet),
      undo: singleton(undoPositionId, validSet),
      threat: canonicalSetList(threatPositionIds, validSet, canonicalIndex),
      forecast: canonicalSetList(forecastPositionIds, validSet, canonicalIndex),
      honey: canonicalSetList(honeyPositionIds, validSet, canonicalIndex),
      'honey-collectable': canonicalSetList(honeyCollectablePositionIds, validSet, canonicalIndex),
      target: canonicalSetList(targetPositionIds, validSet, canonicalIndex),
      'win-frontier': canonicalSetList(winFrontierPositionIds, validSet, canonicalIndex),
      invalid: canonicalSetList(invalidPositionIds, validSet, canonicalIndex),
    });

    const invalidSet = new Set(channels.invalid);
    annotations = Object.freeze({
      positionKindByPosition: positionKinds(positionKindByPosition, validPositions, validSet),
      invalidReasonByPosition: invalidReasons(invalidReasonByPosition, validPositions, validSet, invalidSet),
    });
  } catch (error) {
    const knownReasons = new Set([
      'INVALID_POSITION_LIST',
      'UNKNOWN_POSITION_ID',
      'INVALID_POSITION_KIND',
      'INVALID_INVALID_REASON',
      'INVALID_REASON_WITHOUT_INVALID_ROLE',
    ]);
    return failed(knownReasons.has(error?.message) ? error.message : 'UNKNOWN_POSITION_ID');
  }

  const recommendation = recommendationFromPartner(partnerProjection, validSet);
  const rolesByPosition = buildRolesByPosition(validPositions, channels, recommendation);

  return Object.freeze({
    schema: BOARD_SCHEMA,
    ok: true,
    clear: false,
    reason: null,
    channels,
    annotations,
    recommendation,
    rolesByPosition,
    authorityByRole: AUTHORITY,
  });
}
