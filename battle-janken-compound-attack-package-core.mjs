const BATTLE_JANKEN_COMPOUND_ATTACK_SCHEMA = 'gameroad.battle-janken-compound-attack-package.v1';
const BATTLE_JANKEN_COMPOUND_PREVIEW_SCHEMA = 'gameroad.battle-janken-compound-attack-preview.v1';
const BATTLE_JANKEN_COMPOUND_STAGE_SCHEMA = 'gameroad.battle-janken-compound-attack-stage.v1';
const BATTLE_JANKEN_COMPOUND_COMMIT_SCHEMA = 'gameroad.battle-janken-compound-attack-commit.v1';
const JANKEN_HANDS = new Set(['ROCK', 'SCISSORS', 'PAPER']);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function requiredString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BattleJankenCompoundAttackPackageError(`${field} must be a non-empty string`, 'INVALID_FIELD');
  }
  return value;
}

function optionalString(value, field) {
  if (value == null) return null;
  return requiredString(value, field);
}

function cloneAuthorityValue(value, field, seen = new Set()) {
  if (value == null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new BattleJankenCompoundAttackPackageError(`${field} contains a non-finite number`, 'INVALID_AUTHORITY_VALUE');
    }
    return value;
  }
  if (typeof value !== 'object') {
    throw new BattleJankenCompoundAttackPackageError(`${field} contains a non-data value`, 'INVALID_AUTHORITY_VALUE');
  }
  if (seen.has(value)) {
    throw new BattleJankenCompoundAttackPackageError(`${field} contains a cycle`, 'INVALID_AUTHORITY_VALUE');
  }
  seen.add(value);
  let clone;
  if (Array.isArray(value)) {
    clone = value.map((child, index) => cloneAuthorityValue(child, `${field}[${index}]`, seen));
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new BattleJankenCompoundAttackPackageError(`${field} contains a non-plain object`, 'INVALID_AUTHORITY_VALUE');
    }
    clone = {};
    for (const [key, child] of Object.entries(value)) {
      clone[key] = cloneAuthorityValue(child, `${field}.${key}`, seen);
    }
  }
  seen.delete(value);
  return clone;
}

function deepEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left)) {
    return left.length === right.length && left.every((value, index) => deepEqual(value, right[index]));
  }
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && deepEqual(left[key], right[key]));
}

function normalizePackageCandidate(candidate = {}) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new BattleJankenCompoundAttackPackageError('candidate must be an object', 'INVALID_CANDIDATE');
  }
  const jankenHand = requiredString(candidate.jankenHand, 'jankenHand');
  if (!JANKEN_HANDS.has(jankenHand)) {
    throw new BattleJankenCompoundAttackPackageError('jankenHand must be ROCK, SCISSORS, or PAPER', 'INVALID_JANKEN_HAND');
  }
  const cardId = requiredString(candidate.cardId, 'cardId');
  if (!Array.isArray(candidate.path) || candidate.path.length === 0) {
    throw new BattleJankenCompoundAttackPackageError('path must be a non-empty authority-supplied array', 'INVALID_PATH');
  }
  const path = cloneAuthorityValue(candidate.path, 'path');
  const opponentId = requiredString(candidate.opponentId, 'opponentId');
  const shieldLane = requiredString(candidate.shieldLane, 'shieldLane');
  return {
    schema: BATTLE_JANKEN_COMPOUND_ATTACK_SCHEMA,
    jankenHand,
    cardId,
    path,
    direction: optionalString(candidate.direction, 'direction'),
    roadId: optionalString(candidate.roadId, 'roadId'),
    battleId: optionalString(candidate.battleId, 'battleId'),
    opponentId,
    shieldLane,
    shieldRef: optionalString(candidate.shieldRef, 'shieldRef'),
  };
}

export class BattleJankenCompoundAttackPackageError extends TypeError {
  constructor(message, code = 'INVALID_COMPOUND_ATTACK_PACKAGE') {
    super(message);
    this.name = 'BattleJankenCompoundAttackPackageError';
    this.code = code;
  }
}

export class StaleBattleJankenCompoundAttackPackageError extends Error {
  constructor() {
    super('staged compound attack no longer matches the fresh authoritative candidate');
    this.name = 'StaleBattleJankenCompoundAttackPackageError';
    this.code = 'STALE_COMPOUND_ATTACK_PACKAGE';
  }
}

export function createBattleJankenCompoundAttackPackage(authoritativeCandidate) {
  return deepFreeze(normalizePackageCandidate(authoritativeCandidate));
}

export function projectBattleJankenCompoundAttackPreview(compoundAttackPackage) {
  const pkg = createBattleJankenCompoundAttackPackage(compoundAttackPackage);
  return deepFreeze({
    schema: BATTLE_JANKEN_COMPOUND_PREVIEW_SCHEMA,
    jankenHand: pkg.jankenHand,
    cardId: pkg.cardId,
    route: {
      path: cloneAuthorityValue(pkg.path, 'path'),
      direction: pkg.direction,
      roadId: pkg.roadId,
      battleId: pkg.battleId,
    },
    opponentId: pkg.opponentId,
    shieldLane: pkg.shieldLane,
    shieldRef: pkg.shieldRef,
  });
}

export function sameBattleJankenCompoundAttackPackage(left, right) {
  try {
    return deepEqual(
      createBattleJankenCompoundAttackPackage(left),
      createBattleJankenCompoundAttackPackage(right),
    );
  } catch {
    return false;
  }
}

export function stageBattleJankenCompoundAttack(authoritativeCandidate) {
  const pkg = createBattleJankenCompoundAttackPackage(authoritativeCandidate);
  return deepFreeze({
    schema: BATTLE_JANKEN_COMPOUND_STAGE_SCHEMA,
    status: 'STAGED',
    package: pkg,
    preview: projectBattleJankenCompoundAttackPreview(pkg),
  });
}

export function clearBattleJankenCompoundAttackStage(stage) {
  const staged = stage?.status === 'STAGED' && stage?.package;
  return deepFreeze({
    schema: BATTLE_JANKEN_COMPOUND_STAGE_SCHEMA,
    cleared: Boolean(staged),
    reason: staged ? 'CLEARED_COMPOUND_ATTACK_PACKAGE' : 'NOTHING_TO_CLEAR',
    clearedFields: staged ? ['package', 'preview'] : [],
    next: null,
    authoritativeRollback: false,
    gameStateWrite: false,
  });
}

export function prepareBattleJankenCompoundAttackCommit(stage, freshAuthoritativeCandidate) {
  if (!stage || stage.status !== 'STAGED' || !stage.package) {
    throw new BattleJankenCompoundAttackPackageError('a staged compound attack package is required', 'STAGE_REQUIRED');
  }
  const fresh = createBattleJankenCompoundAttackPackage(freshAuthoritativeCandidate);
  if (!sameBattleJankenCompoundAttackPackage(stage.package, fresh)) {
    throw new StaleBattleJankenCompoundAttackPackageError();
  }
  return deepFreeze({
    schema: BATTLE_JANKEN_COMPOUND_COMMIT_SCHEMA,
    payload: stage.package,
    callerMustSendPayloadOnce: true,
    transportPerformed: false,
    gameStateWrite: false,
  });
}

export const BATTLE_JANKEN_COMPOUND_ATTACK_CONTRACT = deepFreeze({
  schema: BATTLE_JANKEN_COMPOUND_ATTACK_SCHEMA,
  authority: 'CALLER_SUPPLIES_COMPLETE_LEGAL_PACKAGE',
  computesTarget: false,
  computesLegality: false,
  computesMapping: false,
  globalFixedMapping: false,
  randomTargeting: false,
  transportPerformed: false,
  gameStateWrite: false,
  precommitClearWholePackage: true,
  requiresFreshAuthorityRevalidationBeforeCommit: true,
});

export {
  BATTLE_JANKEN_COMPOUND_ATTACK_SCHEMA,
  BATTLE_JANKEN_COMPOUND_PREVIEW_SCHEMA,
  BATTLE_JANKEN_COMPOUND_STAGE_SCHEMA,
  BATTLE_JANKEN_COMPOUND_COMMIT_SCHEMA,
};
