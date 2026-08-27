const BOARD_SCHEMA = 'gameroad.battle-board-visual-explanation.v1';
const PARTNER_SCHEMA = 'gameroad.partner-advice-board-projection.v1';
const RULE_ROLES = Object.freeze(['current', 'selected', 'reachable', 'path', 'threat', 'forecast']);
const AUTHORITY = Object.freeze({
  current: 'rules-derived',
  selected: 'rules-derived',
  reachable: 'rules-derived',
  path: 'rules-derived',
  threat: 'rules-derived',
  forecast: 'rules-derived',
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
 * choose a move, or encode any particular game's visual skin.
 */
export function projectBattleBoardVisualExplanation({
  validPositionIds,
  currentPositionId = null,
  selectedPositionId = null,
  reachablePositionIds = [],
  pathPositionIds = [],
  threatPositionIds = [],
  forecastPositionIds = [],
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

// DOM-facing Battle Core presentation adapter. This stays in the existing classified
// visual-explanation lane so presentation cannot become a second gameplay authority.
export const BATTLE_CORE_PRESENTATION_MOUNT_SCHEMA = 'gameroad.battle-core-presentation-mount.v1';

const RULE_ROLE_SET = new Set(RULE_ROLES);
const ALL_ROLES = Object.freeze([...RULE_ROLES, 'partner-recommendation']);
const ALL_ROLE_SET = new Set(ALL_ROLES);
const ROOT_ATTRS = Object.freeze([
  'data-gmr-battle-core-mounted',
  'data-gmr-battle-core-phase',
  'data-gmr-battle-core-info',
  'data-gmr-battle-core-range',
  'data-gmr-battle-core-advice',
  'data-gmr-battle-core-recommendation',
  'data-gmr-battle-core-recommendation-reason',
]);
const POSITION_ATTRS = Object.freeze([
  'data-gmr-battle-core-roles',
  'data-gmr-battle-core-rule-roles',
  'data-gmr-battle-core-recommendation',
  'data-gmr-battle-core-authority',
]);

function exactPhase(value) {
  const token = exactToken(value);
  return token && token.length <= 64 && /^[a-z0-9][a-z0-9_-]*$/.test(token) ? token : null;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function inactiveMountRecommendation(reason = 'RECOMMENDATION_INACTIVE') {
  return deepFreeze({ active: false, targetId: null, clearReason: reason });
}

function mountFailed(reason, view = null, missingRulePositionIds = []) {
  return deepFreeze({
    schema: BATTLE_CORE_PRESENTATION_MOUNT_SCHEMA,
    ok: false,
    clear: true,
    reason,
    view,
    positions: {},
    recommendation: inactiveMountRecommendation(reason),
    missingRulePositionIds: [...missingRulePositionIds],
  });
}

function normalizeViewState(viewState) {
  if (!viewState || typeof viewState !== 'object' || Array.isArray(viewState)) return null;
  const phase = exactPhase(viewState.phase);
  if (!phase) return null;
  const booleans = ['infoOpen', 'rangeOpen', 'adviceOpen'];
  if (booleans.some((key) => viewState[key] != null && typeof viewState[key] !== 'boolean')) return null;
  return deepFreeze({
    phase,
    infoOpen: viewState.infoOpen === true,
    rangeOpen: viewState.rangeOpen === true,
    adviceOpen: viewState.adviceOpen === true,
  });
}

function normalizeAvailablePositionIds(values) {
  if (values == null || typeof values[Symbol.iterator] !== 'function') return null;
  const ids = [];
  const seen = new Set();
  for (const raw of values) {
    const id = exactToken(raw);
    if (!id || seen.has(id)) return null;
    seen.add(id);
    ids.push(id);
  }
  return deepFreeze(ids);
}

function normalizeMountRolesByPosition(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const positions = new Map();
  for (const [rawId, rawRoles] of Object.entries(raw)) {
    const id = exactToken(rawId);
    if (!id || !Array.isArray(rawRoles) || rawRoles.length === 0) return null;
    const roleSet = new Set();
    for (const role of rawRoles) {
      if (!ALL_ROLE_SET.has(role) || roleSet.has(role)) return null;
      roleSet.add(role);
    }
    positions.set(id, deepFreeze(ALL_ROLES.filter((role) => roleSet.has(role))));
  }
  return positions;
}

function normalizeMountRecommendation(raw, rolesByPosition) {
  if (!raw || typeof raw !== 'object' || raw.active !== true || raw.clear === true) {
    return inactiveMountRecommendation('RECOMMENDATION_INACTIVE');
  }
  const targetId = exactToken(raw.targetId);
  if (
    !targetId
    || raw.presentationRole !== 'partner-recommendation'
    || raw.autoExecute !== false
    || !rolesByPosition.get(targetId)?.includes('partner-recommendation')
  ) {
    return inactiveMountRecommendation('RECOMMENDATION_CONTRACT_MISMATCH');
  }
  return deepFreeze({ active: true, targetId, clearReason: null });
}

/**
 * Converts an already-authoritative semantic projection into DOM-facing presentation state.
 * It never computes legality, movement, pathing, targeting, damage, or Partner advice.
 */
export function projectBattleCorePresentationState({
  boardProjection,
  viewState,
  availablePositionIds,
} = {}) {
  const view = normalizeViewState(viewState);
  if (!view) return mountFailed('INVALID_VIEW_STATE');

  const available = normalizeAvailablePositionIds(availablePositionIds);
  if (!available) return mountFailed('INVALID_POSITION_NODE_SET', view);
  const availableSet = new Set(available);

  if (!boardProjection || typeof boardProjection !== 'object' || Array.isArray(boardProjection)) {
    return mountFailed('BOARD_PROJECTION_UNAVAILABLE', view);
  }
  if (boardProjection.schema !== BOARD_SCHEMA) return mountFailed('BOARD_PROJECTION_SCHEMA_MISMATCH', view);
  if (boardProjection.ok !== true || boardProjection.clear === true) {
    return mountFailed(exactToken(boardProjection.reason) || 'BOARD_PROJECTION_UNAVAILABLE', view);
  }

  const rolesByPosition = normalizeMountRolesByPosition(boardProjection.rolesByPosition);
  if (!rolesByPosition) return mountFailed('BOARD_ROLE_MAP_INVALID', view);

  const missingRulePositionIds = [];
  for (const [id, roles] of rolesByPosition) {
    if (roles.some((role) => RULE_ROLE_SET.has(role)) && !availableSet.has(id)) missingRulePositionIds.push(id);
  }
  if (missingRulePositionIds.length) return mountFailed('RULE_POSITION_UNMAPPED', view, missingRulePositionIds);

  let recommendation = normalizeMountRecommendation(boardProjection.recommendation, rolesByPosition);
  if (recommendation.active && !availableSet.has(recommendation.targetId)) {
    recommendation = inactiveMountRecommendation('RECOMMENDATION_TARGET_UNMAPPED');
  }

  const positions = {};
  for (const id of available) {
    const suppliedRoles = rolesByPosition.get(id) || [];
    const ruleRoles = RULE_ROLES.filter((role) => suppliedRoles.includes(role));
    const recommendationHere = recommendation.active && recommendation.targetId === id;
    const roles = recommendationHere ? [...ruleRoles, 'partner-recommendation'] : ruleRoles;
    if (!roles.length) continue;
    positions[id] = deepFreeze({
      roles,
      ruleRoles,
      recommendation: recommendationHere,
      authority: ruleRoles.length ? (recommendationHere ? 'mixed' : 'rules-derived') : 'partner-heuristic',
    });
  }

  return deepFreeze({
    schema: BATTLE_CORE_PRESENTATION_MOUNT_SCHEMA,
    ok: true,
    clear: false,
    reason: null,
    view,
    positions,
    recommendation,
    missingRulePositionIds: [],
  });
}

function requireElement(value, label) {
  if (!value || typeof value.setAttribute !== 'function' || typeof value.removeAttribute !== 'function') {
    throw new TypeError(`${label} must support setAttribute/removeAttribute`);
  }
  return value;
}

function removeOwnedAttributes(node, names) {
  for (const name of names) node.removeAttribute(name);
}

function defaultPositionIdOf(node) {
  if (typeof node.getAttribute === 'function') {
    const attribute = node.getAttribute('data-position-id');
    if (attribute != null) return attribute;
  }
  return node?.dataset?.positionId ?? null;
}

export function createBattleCorePresentationMount({
  root,
  positionElements = [],
  positionIdOf = defaultPositionIdOf,
} = {}) {
  requireElement(root, 'root');
  if (typeof positionIdOf !== 'function') throw new TypeError('positionIdOf must be a function');
  if (typeof positionElements !== 'function' && (positionElements == null || typeof positionElements[Symbol.iterator] !== 'function')) {
    throw new TypeError('positionElements must be iterable or a provider function');
  }

  let destroyed = false;
  const knownNodes = new Set();

  function readNodes() {
    const source = typeof positionElements === 'function' ? positionElements() : positionElements;
    if (source == null || typeof source[Symbol.iterator] !== 'function') throw new Error('POSITION_NODE_SET_UNAVAILABLE');
    const map = new Map();
    const nodes = [];
    for (const rawNode of source) {
      const node = requireElement(rawNode, 'position element');
      const id = exactToken(positionIdOf(node));
      if (!id) throw new Error('POSITION_ID_INVALID');
      if (map.has(id)) throw new Error('DUPLICATE_POSITION_NODE');
      map.set(id, node);
      nodes.push(node);
      knownNodes.add(node);
    }
    return { map, nodes };
  }

  function clearOwned(currentNodes = []) {
    removeOwnedAttributes(root, ROOT_ATTRS);
    for (const node of new Set([...knownNodes, ...currentNodes])) removeOwnedAttributes(node, POSITION_ATTRS);
  }

  function clear(reason = 'MANUAL_CLEAR') {
    let currentNodes = [];
    try {
      currentNodes = readNodes().nodes;
    } catch {
      // Previously-owned attributes can still be removed if the live provider disappears.
    }
    clearOwned(currentNodes);
    return mountFailed(reason);
  }

  function render({ boardProjection, viewState } = {}) {
    if (destroyed) return mountFailed('MOUNT_DESTROYED');

    let nodeSet;
    try {
      nodeSet = readNodes();
    } catch (error) {
      clearOwned();
      return mountFailed(exactToken(error?.message) || 'POSITION_NODE_SET_INVALID');
    }

    clearOwned(nodeSet.nodes);
    const projection = projectBattleCorePresentationState({
      boardProjection,
      viewState,
      availablePositionIds: nodeSet.map.keys(),
    });
    if (!projection.ok) return projection;

    root.setAttribute('data-gmr-battle-core-mounted', 'true');
    root.setAttribute('data-gmr-battle-core-phase', projection.view.phase);
    root.setAttribute('data-gmr-battle-core-info', projection.view.infoOpen ? 'open' : 'closed');
    root.setAttribute('data-gmr-battle-core-range', projection.view.rangeOpen ? 'open' : 'closed');
    root.setAttribute('data-gmr-battle-core-advice', projection.view.adviceOpen ? 'open' : 'closed');
    root.setAttribute('data-gmr-battle-core-recommendation', projection.recommendation.active ? 'active' : 'inactive');
    if (!projection.recommendation.active && projection.recommendation.clearReason) {
      root.setAttribute('data-gmr-battle-core-recommendation-reason', projection.recommendation.clearReason);
    }

    for (const [id, position] of Object.entries(projection.positions)) {
      const node = nodeSet.map.get(id);
      node.setAttribute('data-gmr-battle-core-roles', position.roles.join(' '));
      if (position.ruleRoles.length) node.setAttribute('data-gmr-battle-core-rule-roles', position.ruleRoles.join(' '));
      if (position.recommendation) node.setAttribute('data-gmr-battle-core-recommendation', 'active');
      node.setAttribute('data-gmr-battle-core-authority', position.authority);
    }

    return projection;
  }

  function destroy() {
    if (destroyed) return false;
    clear();
    destroyed = true;
    return true;
  }

  return deepFreeze({
    schema: BATTLE_CORE_PRESENTATION_MOUNT_SCHEMA,
    render,
    clear,
    destroy,
    isDestroyed: () => destroyed,
  });
}
