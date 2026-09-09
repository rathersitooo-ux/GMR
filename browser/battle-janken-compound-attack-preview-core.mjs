export const BATTLE_JANKEN_COMPOUND_ATTACK_PREVIEW_SCHEMA = 'gameroad.battle-janken-compound-attack-preview.v1';

const SHIELD_LANES = new Set(['L', 'C', 'R']);

function fail(code) {
  throw new TypeError(code);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function requiredString(value, code) {
  if (typeof value !== 'string' || value.trim() === '') fail(code);
  return value.trim();
}

function optionalString(value, code) {
  if (value == null) return null;
  return requiredString(value, code);
}

function cloneAcceptedPath(path) {
  if (!Array.isArray(path) || path.length === 0) fail('BATTLE_COMPOUND_PREVIEW_PATH_REQUIRED');
  try {
    return JSON.parse(JSON.stringify(path));
  } catch {
    fail('BATTLE_COMPOUND_PREVIEW_PATH_INVALID');
  }
}

function normalizePackage(compoundAttackPackage) {
  if (!compoundAttackPackage || typeof compoundAttackPackage !== 'object' || Array.isArray(compoundAttackPackage)) {
    fail('BATTLE_COMPOUND_PREVIEW_PACKAGE_REQUIRED');
  }
  if (compoundAttackPackage.source !== 'current_public_authoritative_board_legal_target_state') {
    fail('BATTLE_COMPOUND_PREVIEW_SOURCE_NOT_AUTHORITATIVE');
  }
  if (compoundAttackPackage.visualIntent !== 'precommit_exact_compound_attack_preview') {
    fail('BATTLE_COMPOUND_PREVIEW_VISUAL_INTENT_INVALID');
  }
  if (compoundAttackPackage.gameplayMutationClaimed !== false) {
    fail('BATTLE_COMPOUND_PREVIEW_GAMEPLAY_MUTATION_FORBIDDEN');
  }

  const packageId = requiredString(compoundAttackPackage.packageId, 'BATTLE_COMPOUND_PREVIEW_PACKAGE_ID_REQUIRED');
  const cardId = requiredString(compoundAttackPackage.cardId, 'BATTLE_COMPOUND_PREVIEW_CARD_ID_REQUIRED');
  const jankenHand = requiredString(compoundAttackPackage.jankenHand, 'BATTLE_COMPOUND_PREVIEW_JANKEN_HAND_REQUIRED');
  const opponentId = requiredString(compoundAttackPackage.opponentId, 'BATTLE_COMPOUND_PREVIEW_OPPONENT_REQUIRED');
  const shieldLane = requiredString(compoundAttackPackage.shieldLane, 'BATTLE_COMPOUND_PREVIEW_SHIELD_LANE_REQUIRED').toUpperCase();
  if (!SHIELD_LANES.has(shieldLane)) fail('BATTLE_COMPOUND_PREVIEW_SHIELD_LANE_INVALID');

  const direction = requiredString(compoundAttackPackage.direction, 'BATTLE_COMPOUND_PREVIEW_DIRECTION_REQUIRED');
  const destinationKey = requiredString(compoundAttackPackage.destinationKey, 'BATTLE_COMPOUND_PREVIEW_DESTINATION_KEY_REQUIRED');
  if (destinationKey !== `${opponentId}:${shieldLane}`) {
    fail('BATTLE_COMPOUND_PREVIEW_DESTINATION_KEY_MISMATCH');
  }

  return deepFreeze({
    packageId,
    cardId,
    jankenHand,
    path: cloneAcceptedPath(compoundAttackPackage.path),
    direction,
    routeId: optionalString(compoundAttackPackage.routeId, 'BATTLE_COMPOUND_PREVIEW_ROUTE_ID_INVALID'),
    opponentId,
    shieldLane,
    shieldRef: optionalString(compoundAttackPackage.shieldRef, 'BATTLE_COMPOUND_PREVIEW_SHIELD_REF_INVALID'),
    destinationKey,
    authorityRevision: optionalString(compoundAttackPackage.authorityRevision, 'BATTLE_COMPOUND_PREVIEW_AUTHORITY_REVISION_INVALID'),
  });
}

function motionProjection({ reducedMotion, lowPerf }) {
  if (reducedMotion === true || lowPerf === true) {
    return deepFreeze({
      mode: 'static_exact_preview',
      animateAcceptedPath: false,
      destinationPulse: false,
      preserveRouteAndTargetMeaning: true,
    });
  }
  return deepFreeze({
    mode: 'exact_precommit_trace',
    animateAcceptedPath: true,
    destinationPulse: true,
    preserveRouteAndTargetMeaning: true,
  });
}

function buildStages(pkg) {
  return Object.freeze([
    deepFreeze({
      kind: 'source_choice',
      cardId: pkg.cardId,
      jankenHand: pkg.jankenHand,
      authority: 'caller_supplied_current_janken_card_identity',
    }),
    deepFreeze({
      kind: 'accepted_route',
      path: cloneAcceptedPath(pkg.path),
      direction: pkg.direction,
      routeId: pkg.routeId,
      authority: 'caller_supplied_authoritative_route_only',
    }),
    deepFreeze({
      kind: 'opponent',
      opponentId: pkg.opponentId,
      authority: 'caller_supplied_authoritative_opponent_only',
    }),
    deepFreeze({
      kind: 'shield_destination',
      opponentId: pkg.opponentId,
      shieldLane: pkg.shieldLane,
      shieldRef: pkg.shieldRef,
      destinationKey: pkg.destinationKey,
      authority: 'caller_supplied_authoritative_shield_lane_only',
    }),
  ]);
}

export function projectBattleJankenCompoundAttackPreview({
  compoundAttackPackage,
  reducedMotion = false,
  lowPerf = false,
} = {}) {
  const pkg = normalizePackage(compoundAttackPackage);
  const acceptedPath = cloneAcceptedPath(pkg.path);
  const stages = buildStages(pkg);

  return deepFreeze({
    schema: BATTLE_JANKEN_COMPOUND_ATTACK_PREVIEW_SCHEMA,
    presentationOnly: true,
    precommitOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    commitExecution: false,
    legalityCalculation: false,
    targetCalculation: false,
    targetMappingCalculation: false,
    routeCalculation: false,
    randomSelection: false,
    secretStateRead: false,
    packageId: pkg.packageId,
    authorityRevision: pkg.authorityRevision,
    sourceCard: {
      cardId: pkg.cardId,
      jankenHand: pkg.jankenHand,
    },
    acceptedRoute: {
      path: acceptedPath,
      direction: pkg.direction,
      routeId: pkg.routeId,
    },
    destination: {
      opponentId: pkg.opponentId,
      shieldLane: pkg.shieldLane,
      shieldRef: pkg.shieldRef,
      destinationKey: pkg.destinationKey,
    },
    stages,
    motion: motionProjection({
      reducedMotion: reducedMotion === true,
      lowPerf: lowPerf === true,
    }),
  });
}

export function auditBattleJankenCompoundAttackPreview(projection) {
  const defects = [];
  if (!projection || projection.schema !== BATTLE_JANKEN_COMPOUND_ATTACK_PREVIEW_SCHEMA) defects.push('SCHEMA');
  if (projection?.presentationOnly !== true || projection?.precommitOnly !== true) defects.push('BOUNDARY');
  if (projection?.gameplayAuthority !== false || projection?.gameStateWrite !== false || projection?.commitExecution !== false) defects.push('AUTHORITY');
  if (projection?.legalityCalculation !== false || projection?.targetCalculation !== false || projection?.targetMappingCalculation !== false || projection?.routeCalculation !== false) defects.push('RECALCULATION');
  if (projection?.randomSelection !== false || projection?.secretStateRead !== false) defects.push('HIDDEN_OR_RANDOM');
  if (!Array.isArray(projection?.acceptedRoute?.path) || projection.acceptedRoute.path.length === 0) defects.push('PATH');
  if (!SHIELD_LANES.has(projection?.destination?.shieldLane)) defects.push('SHIELD');
  if (projection?.destination?.destinationKey !== `${projection?.destination?.opponentId}:${projection?.destination?.shieldLane}`) defects.push('DESTINATION');
  if (!Array.isArray(projection?.stages) || projection.stages.map(stage => stage.kind).join('|') !== 'source_choice|accepted_route|opponent|shield_destination') defects.push('STAGES');
  if (!['exact_precommit_trace', 'static_exact_preview'].includes(projection?.motion?.mode)) defects.push('MOTION');
  return deepFreeze({ ok: defects.length === 0, defects });
}

export const BATTLE_JANKEN_COMPOUND_ATTACK_PREVIEW_CONTRACT = deepFreeze({
  schema: BATTLE_JANKEN_COMPOUND_ATTACK_PREVIEW_SCHEMA,
  authority: 'NONE_PRESENTATION_ONLY',
  requiredSource: 'current_public_authoritative_board_legal_target_state',
  inputPackage: 'caller_supplied_exact_card_hand_route_opponent_shield',
  postCommitTargetPicker: false,
  legalityCalculation: false,
  targetCalculation: false,
  targetMappingCalculation: false,
  routeCalculation: false,
  randomSelection: false,
  secretStateRead: false,
  gameplayWrite: false,
  liveMountOwnedHere: false,
  targetCoverageProofOwnedHere: false,
  shieldLanes: Object.freeze(['L', 'C', 'R']),
});
