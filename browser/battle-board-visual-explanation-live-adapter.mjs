const ADAPTER_SCHEMA = 'gameroad.battle-board-visual-explanation-live-adapter.v1';
const BOARD_SCHEMA = 'gameroad.battle-board-visual-explanation.v1';

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

const ROLE_SET = new Set(RULE_ROLES);
const ROLE_ATTR = 'data-gmr-board-roles';
const POSITION_KIND_ATTR = 'data-gmr-board-position-kind';
const TARGET_KIND_ATTR = 'data-gmr-board-target-kind';
const INVALID_REASON_ATTR = 'data-gmr-board-invalid-reason';

function requireProjection(projection) {
  if (!projection || typeof projection !== 'object' || Array.isArray(projection)) {
    throw new Error('projection must be an object');
  }
  if (projection.schema !== BOARD_SCHEMA) throw new Error('unsupported board projection schema');
  return projection;
}

function requireResolver(resolveElementByPositionId) {
  if (typeof resolveElementByPositionId !== 'function') {
    throw new Error('resolveElementByPositionId must be a function');
  }
  return resolveElementByPositionId;
}

function exactToken(value) {
  return typeof value === 'string' && value.length > 0 && value.trim() === value ? value : null;
}

function requireElementContract(element, positionId) {
  if (!element || typeof element.setAttribute !== 'function' || typeof element.removeAttribute !== 'function') {
    throw new Error(`resolved element for ${positionId} must support setAttribute/removeAttribute`);
  }
  return element;
}

function clearElement(element) {
  element.removeAttribute(ROLE_ATTR);
  element.removeAttribute(POSITION_KIND_ATTR);
  element.removeAttribute(TARGET_KIND_ATTR);
  element.removeAttribute(INVALID_REASON_ATTR);
  for (const role of RULE_ROLES) element.removeAttribute(`data-gmr-board-${role}`);
}

function normalizedRuleRoles(projection, positionId) {
  const raw = projection.rolesByPosition?.[positionId];
  if (!Array.isArray(raw)) return Object.freeze([]);
  const roles = [];
  for (const role of raw) {
    if (!ROLE_SET.has(role)) continue;
    if (projection.authorityByRole?.[role] !== 'rules-derived') continue;
    if (!roles.includes(role)) roles.push(role);
  }
  return Object.freeze(roles);
}

function annotationValue(map, positionId) {
  const value = map?.[positionId];
  return exactToken(value);
}

/**
 * Maps the already-authoritative semantic board projection onto existing DOM nodes.
 *
 * This adapter intentionally does not calculate legality, targets, routes, threat,
 * recommendation, card effects, or visual skin. Partner recommendation is returned
 * separately for the existing Partner projection path and is never promoted into a
 * rules-derived board role or mutated on DOM by this adapter.
 */
export function createBattleBoardVisualExplanationLiveAdapter({ resolveElementByPositionId } = {}) {
  const resolve = requireResolver(resolveElementByPositionId);
  const touched = new Map();
  let revision = 0;

  const clear = (reason = 'cleared') => {
    let clearedCount = 0;
    for (const [, element] of touched) {
      clearElement(element);
      clearedCount += 1;
    }
    touched.clear();
    revision += 1;
    return Object.freeze({
      schema: ADAPTER_SCHEMA,
      ok: true,
      clear: true,
      reason,
      revision,
      appliedPositionIds: Object.freeze([]),
      missingPositionIds: Object.freeze([]),
      clearedCount,
      partnerRecommendation: null,
    });
  };

  const apply = (rawProjection) => {
    const projection = requireProjection(rawProjection);

    let clearedCount = 0;
    for (const [, element] of touched) {
      clearElement(element);
      clearedCount += 1;
    }
    touched.clear();
    revision += 1;

    if (projection.ok !== true || projection.clear === true) {
      return Object.freeze({
        schema: ADAPTER_SCHEMA,
        ok: false,
        clear: true,
        reason: exactToken(projection.reason) || 'PROJECTION_CLEARED',
        revision,
        appliedPositionIds: Object.freeze([]),
        missingPositionIds: Object.freeze([]),
        clearedCount,
        partnerRecommendation: null,
      });
    }

    const positionIds = new Set();
    for (const positionId of Object.keys(projection.rolesByPosition || {})) {
      if (normalizedRuleRoles(projection, positionId).length) positionIds.add(positionId);
    }
    for (const map of [
      projection.annotations?.positionKindByPosition,
      projection.annotations?.targetKindByPosition,
      projection.annotations?.invalidReasonByPosition,
    ]) {
      for (const positionId of Object.keys(map || {})) positionIds.add(positionId);
    }

    const applied = [];
    const missing = [];
    for (const positionId of positionIds) {
      if (!exactToken(positionId)) continue;
      const element = resolve(positionId);
      if (element == null) {
        missing.push(positionId);
        continue;
      }
      requireElementContract(element, positionId);
      clearElement(element);
      touched.set(positionId, element);

      const roles = normalizedRuleRoles(projection, positionId);
      if (roles.length) {
        element.setAttribute(ROLE_ATTR, roles.join(' '));
        for (const role of roles) element.setAttribute(`data-gmr-board-${role}`, 'true');
      }

      const positionKind = annotationValue(projection.annotations?.positionKindByPosition, positionId);
      const targetKind = annotationValue(projection.annotations?.targetKindByPosition, positionId);
      const invalidReason = annotationValue(projection.annotations?.invalidReasonByPosition, positionId);
      if (positionKind) element.setAttribute(POSITION_KIND_ATTR, positionKind);
      if (targetKind) element.setAttribute(TARGET_KIND_ATTR, targetKind);
      if (invalidReason) element.setAttribute(INVALID_REASON_ATTR, invalidReason);

      applied.push(positionId);
    }

    const recommendation = projection.recommendation?.active === true && projection.recommendation?.clear !== true
      ? Object.freeze({
          targetId: exactToken(projection.recommendation.targetId),
          candidateId: exactToken(projection.recommendation.candidateId),
          presentationRole: projection.recommendation.presentationRole,
          authority: projection.recommendation.authority,
          autoExecute: projection.recommendation.autoExecute,
        })
      : null;

    return Object.freeze({
      schema: ADAPTER_SCHEMA,
      ok: true,
      clear: false,
      reason: null,
      revision,
      appliedPositionIds: Object.freeze(applied),
      missingPositionIds: Object.freeze(missing),
      clearedCount,
      partnerRecommendation: recommendation,
    });
  };

  const destroy = () => clear('destroyed');

  return Object.freeze({
    schema: ADAPTER_SCHEMA,
    apply,
    clear,
    destroy,
    getRevision: () => revision,
  });
}

export const BATTLE_BOARD_VISUAL_EXPLANATION_LIVE_ADAPTER_SCHEMA = ADAPTER_SCHEMA;
export const BATTLE_BOARD_RULE_ROLE_ATTRIBUTES = Object.freeze(
  Object.fromEntries(RULE_ROLES.map((role) => [role, `data-gmr-board-${role}`])),
);
