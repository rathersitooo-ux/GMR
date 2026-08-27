export const BATTLE_CORE_PRESENTATION_MOUNT_SCHEMA = 'gameroad.battle-core-presentation-mount.v1';

const BOARD_SCHEMA = 'gameroad.battle-board-visual-explanation.v1';
const RULE_ROLES = Object.freeze(['current', 'selected', 'reachable', 'path', 'threat', 'forecast']);
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

function exactToken(value, max = 160) {
  if (typeof value !== 'string') return null;
  if (!value || value.trim() !== value || value.length > max) return null;
  return value;
}

function exactPhase(value) {
  const token = exactToken(value, 64);
  return token && /^[a-z0-9][a-z0-9_-]*$/.test(token) ? token : null;
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
}

function inactiveRecommendation(reason = 'RECOMMENDATION_INACTIVE') {
  return freeze({ active: false, targetId: null, clearReason: reason });
}

function failed(reason, view = null, missingRulePositionIds = []) {
  return freeze({
    schema: BATTLE_CORE_PRESENTATION_MOUNT_SCHEMA,
    ok: false,
    clear: true,
    reason,
    view,
    positions: {},
    recommendation: inactiveRecommendation(reason),
    missingRulePositionIds: [...missingRulePositionIds],
  });
}

function normalizeViewState(viewState) {
  if (!viewState || typeof viewState !== 'object' || Array.isArray(viewState)) return null;
  const phase = exactPhase(viewState.phase);
  if (!phase) return null;
  const booleans = ['infoOpen', 'rangeOpen', 'adviceOpen'];
  if (booleans.some((key) => viewState[key] != null && typeof viewState[key] !== 'boolean')) return null;
  return freeze({
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
  return freeze(ids);
}

function normalizeRolesByPosition(raw) {
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
    positions.set(id, freeze(ALL_ROLES.filter((role) => roleSet.has(role))));
  }
  return positions;
}

function normalizeRecommendation(raw, rolesByPosition) {
  if (!raw || typeof raw !== 'object' || raw.active !== true || raw.clear === true) {
    return inactiveRecommendation('RECOMMENDATION_INACTIVE');
  }
  const targetId = exactToken(raw.targetId);
  if (
    !targetId
    || raw.presentationRole !== 'partner-recommendation'
    || raw.autoExecute !== false
    || !rolesByPosition.get(targetId)?.includes('partner-recommendation')
  ) {
    return inactiveRecommendation('RECOMMENDATION_CONTRACT_MISMATCH');
  }
  return freeze({ active: true, targetId, clearReason: null });
}

/**
 * Converts an already-authoritative Battle board semantic projection into a DOM-facing
 * presentation projection. This function never computes legality, movement, pathing,
 * targeting, or advice; it only validates and maps roles that were supplied by the
 * current board/advice authority.
 */
export function projectBattleCorePresentationState({
  boardProjection,
  viewState,
  availablePositionIds,
} = {}) {
  const view = normalizeViewState(viewState);
  if (!view) return failed('INVALID_VIEW_STATE');

  const available = normalizeAvailablePositionIds(availablePositionIds);
  if (!available) return failed('INVALID_POSITION_NODE_SET', view);
  const availableSet = new Set(available);

  if (!boardProjection || typeof boardProjection !== 'object' || Array.isArray(boardProjection)) {
    return failed('BOARD_PROJECTION_UNAVAILABLE', view);
  }
  if (boardProjection.schema !== BOARD_SCHEMA) return failed('BOARD_PROJECTION_SCHEMA_MISMATCH', view);
  if (boardProjection.ok !== true || boardProjection.clear === true) {
    return failed(exactToken(boardProjection.reason) || 'BOARD_PROJECTION_UNAVAILABLE', view);
  }

  const rolesByPosition = normalizeRolesByPosition(boardProjection.rolesByPosition);
  if (!rolesByPosition) return failed('BOARD_ROLE_MAP_INVALID', view);

  const missingRulePositionIds = [];
  for (const [id, roles] of rolesByPosition) {
    if (roles.some((role) => RULE_ROLE_SET.has(role)) && !availableSet.has(id)) missingRulePositionIds.push(id);
  }
  if (missingRulePositionIds.length) {
    return failed('RULE_POSITION_UNMAPPED', view, missingRulePositionIds);
  }

  let recommendation = normalizeRecommendation(boardProjection.recommendation, rolesByPosition);
  if (recommendation.active && !availableSet.has(recommendation.targetId)) {
    recommendation = inactiveRecommendation('RECOMMENDATION_TARGET_UNMAPPED');
  }

  const positions = {};
  for (const id of available) {
    const suppliedRoles = rolesByPosition.get(id) || [];
    const ruleRoles = RULE_ROLES.filter((role) => suppliedRoles.includes(role));
    const recommendationHere = recommendation.active && recommendation.targetId === id;
    const roles = recommendationHere ? [...ruleRoles, 'partner-recommendation'] : ruleRoles;
    if (!roles.length) continue;
    positions[id] = freeze({
      roles,
      ruleRoles,
      recommendation: recommendationHere,
      authority: ruleRoles.length ? (recommendationHere ? 'mixed' : 'rules-derived') : 'partner-heuristic',
    });
  }

  return freeze({
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
      // Clearing previously-owned nodes/root remains safe even if the provider is unavailable.
    }
    clearOwned(currentNodes);
    return failed(reason);
  }

  function render({ boardProjection, viewState } = {}) {
    if (destroyed) return failed('MOUNT_DESTROYED');

    let nodeSet;
    try {
      nodeSet = readNodes();
    } catch (error) {
      clearOwned();
      return failed(exactToken(error?.message) || 'POSITION_NODE_SET_INVALID');
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

  return freeze({
    schema: BATTLE_CORE_PRESENTATION_MOUNT_SCHEMA,
    render,
    clear,
    destroy,
    isDestroyed: () => destroyed,
  });
}
