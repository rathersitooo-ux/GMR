const BRIDGE_SCHEMA = 'gameroad.battle-flanora-legacy-board-bridge.v1';
const ROLE_ATTR = 'data-flanora-authority-roles';
const ROLE_TOKENS = new Set(['reachable', 'selected', 'partner-recommendation']);
const REF_KINDS = new Set(['clearing', 'shield', 'road', 'goal']);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function token(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0 ? value : null;
}

function normalizeSurfaceRef(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !REF_KINDS.has(value.kind)) return null;
  if (value.kind === 'clearing') {
    const cellId = token(value.cellId);
    return cellId ? { kind: 'clearing', cellId } : null;
  }
  const participantId = token(value.participantId);
  const laneIndex = Number(value.laneIndex);
  if (!participantId || !Number.isSafeInteger(laneIndex) || laneIndex < 0 || laneIndex > 2) return null;
  if (value.kind === 'road') {
    const roadIndex = Number(value.roadIndex);
    if (!Number.isSafeInteger(roadIndex) || roadIndex < 1 || roadIndex > 7) return null;
    return { kind: 'road', participantId, laneIndex, roadIndex };
  }
  return { kind: value.kind, participantId, laneIndex };
}

function resolveSurfaceRef(surfaceRuntime, ref) {
  if (ref.kind === 'clearing') return surfaceRuntime.resolveClearingCell?.(ref.cellId) ?? null;
  if (ref.kind === 'shield') return surfaceRuntime.resolveShield?.(ref.participantId, ref.laneIndex) ?? null;
  if (ref.kind === 'road') return surfaceRuntime.resolveRoadStep?.(ref.participantId, ref.laneIndex, ref.roadIndex) ?? null;
  if (ref.kind === 'goal') return surfaceRuntime.resolveGoal?.(ref.participantId, ref.laneIndex) ?? null;
  return null;
}

function normalizeIdList(value, code) {
  if (!Array.isArray(value)) throw new TypeError(code);
  const ids = value.map(token);
  if (ids.some((id) => id === null) || new Set(ids).size !== ids.length) throw new TypeError(code);
  return ids;
}

function clearProjection(nodes) {
  for (const node of nodes) node?.removeAttribute?.(ROLE_ATTR);
}

export function createFlanoraLegacyBoardBridge({ surfaceRuntime, bindings } = {}) {
  if (!surfaceRuntime || surfaceRuntime.mounted !== true || surfaceRuntime.gameplayAuthority !== false || surfaceRuntime.movementAuthority !== false) {
    throw new TypeError('FLANORA_PRESENTATION_RUNTIME_REQUIRED');
  }
  if (!Array.isArray(bindings) || bindings.length === 0) throw new TypeError('FLANORA_POSITION_BINDINGS_REQUIRED');

  const byAuthorityPositionId = new Map();
  for (const binding of bindings) {
    const authorityPositionId = token(binding?.authorityPositionId);
    const surfaceRef = normalizeSurfaceRef(binding?.surfaceRef);
    if (!authorityPositionId || !surfaceRef) throw new TypeError('FLANORA_POSITION_BINDING_INVALID');
    if (byAuthorityPositionId.has(authorityPositionId)) throw new TypeError('FLANORA_POSITION_BINDING_DUPLICATE');
    const node = resolveSurfaceRef(surfaceRuntime, surfaceRef);
    if (!node) throw new TypeError(`FLANORA_SURFACE_TARGET_UNRESOLVED:${authorityPositionId}`);
    byAuthorityPositionId.set(authorityPositionId, { authorityPositionId, surfaceRef: deepFreeze(surfaceRef), node });
  }

  const boundNodes = [...new Set([...byAuthorityPositionId.values()].map((entry) => entry.node))];

  function projectAuthoritySnapshot({
    validPositionIds = [],
    reachablePositionIds = [],
    selectedPositionId = null,
    partnerRecommendationPositionId = null,
  } = {}) {
    let valid;
    let reachable;
    try {
      valid = normalizeIdList(validPositionIds, 'FLANORA_VALID_POSITION_IDS_INVALID');
      reachable = normalizeIdList(reachablePositionIds, 'FLANORA_REACHABLE_POSITION_IDS_INVALID');
    } catch (error) {
      return deepFreeze({ ok: false, reason: error.message });
    }
    const validSet = new Set(valid);
    if (reachable.some((id) => !validSet.has(id))) return deepFreeze({ ok: false, reason: 'FLANORA_REACHABLE_NOT_VALID' });

    const selected = selectedPositionId == null ? null : token(selectedPositionId);
    const partner = partnerRecommendationPositionId == null ? null : token(partnerRecommendationPositionId);
    if (selectedPositionId != null && !selected) return deepFreeze({ ok: false, reason: 'FLANORA_SELECTED_POSITION_INVALID' });
    if (partnerRecommendationPositionId != null && !partner) return deepFreeze({ ok: false, reason: 'FLANORA_PARTNER_POSITION_INVALID' });
    if (selected && !validSet.has(selected)) return deepFreeze({ ok: false, reason: 'FLANORA_SELECTED_NOT_VALID' });
    if (partner && !validSet.has(partner)) return deepFreeze({ ok: false, reason: 'FLANORA_PARTNER_NOT_VALID' });

    const unmapped = valid.filter((id) => !byAuthorityPositionId.has(id));
    if (unmapped.length) return deepFreeze({ ok: false, reason: 'FLANORA_POSITION_BINDING_INCOMPLETE', unmappedPositionIds: unmapped });

    const rolesByAuthorityPositionId = {};
    for (const id of valid) rolesByAuthorityPositionId[id] = [];
    for (const id of reachable) rolesByAuthorityPositionId[id].push('reachable');
    if (selected) rolesByAuthorityPositionId[selected].push('selected');
    if (partner) rolesByAuthorityPositionId[partner].push('partner-recommendation');

    return deepFreeze({
      ok: true,
      presentationOnly: true,
      gameplayAuthority: false,
      movementAuthority: false,
      validPositionIds: valid,
      rolesByAuthorityPositionId,
    });
  }

  function applyAuthoritySnapshot(snapshot) {
    const projection = projectAuthoritySnapshot(snapshot);
    clearProjection(boundNodes);
    if (!projection.ok) return projection;
    for (const [authorityPositionId, roles] of Object.entries(projection.rolesByAuthorityPositionId)) {
      const safeRoles = roles.filter((role) => ROLE_TOKENS.has(role));
      if (!safeRoles.length) continue;
      byAuthorityPositionId.get(authorityPositionId)?.node?.setAttribute?.(ROLE_ATTR, safeRoles.join(' '));
    }
    return projection;
  }

  return Object.freeze({
    schema: BRIDGE_SCHEMA,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    movementAuthority: false,
    legalityAuthority: false,
    targetCalculation: false,
    resultAuthority: false,
    bindingCount: byAuthorityPositionId.size,
    resolvePosition(authorityPositionId) {
      const id = token(authorityPositionId);
      return id ? byAuthorityPositionId.get(id)?.node ?? null : null;
    },
    resolveSurfaceRef(authorityPositionId) {
      const id = token(authorityPositionId);
      return id ? byAuthorityPositionId.get(id)?.surfaceRef ?? null : null;
    },
    projectAuthoritySnapshot,
    applyAuthoritySnapshot,
    clear() {
      clearProjection(boundNodes);
    },
  });
}

export const FLANORA_LEGACY_BOARD_BRIDGE_CONTRACT = deepFreeze({
  schema: BRIDGE_SCHEMA,
  presentationOnly: true,
  gameplayAuthority: false,
  movementAuthority: false,
  targetCalculation: false,
  resultAuthority: false,
  requiresCallerOwnedPositionBindings: true,
  unknownPositionPolicy: 'FAIL_CLOSED',
  replacesLegacyBoardAuthority: false,
  controlledCharacterOwnedElsewhere: true,
  advicePartnerOwnedElsewhere: true,
  optionalDiceOrRouletteIncluded: false,
});
