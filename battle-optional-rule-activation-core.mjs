const OPTIONAL_RULE_KEYS = Object.freeze(['dice', 'roulette']);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function canonicalAuthorityRef(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed === value ? value : null;
}

function freezeJsonLike(value) {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => freezeJsonLike(entry)));
  }
  if (!isPlainObject(value)) return value;
  const copied = {};
  for (const [key, entry] of Object.entries(value)) {
    copied[key] = freezeJsonLike(entry);
  }
  return Object.freeze(copied);
}

function disabledRule(reason = 'NOT_EXPLICITLY_ENABLED') {
  return Object.freeze({
    enabled: false,
    parameters: null,
    reason,
  });
}

function projectOneRule(rawRule) {
  if (!isPlainObject(rawRule) || rawRule.enabled !== true) {
    return disabledRule();
  }
  return Object.freeze({
    enabled: true,
    parameters: isPlainObject(rawRule.parameters)
      ? freezeJsonLike(rawRule.parameters)
      : null,
    reason: 'AUTHORITY_ENABLED',
  });
}

/**
 * Project an already-resolved authoritative Battle rule context into the two
 * currently supported optional-rule activation flags.
 *
 * This is deliberately not a rule resolver. The caller owns precedence among
 * regulation/map/other rule contexts and supplies a canonical authorityRef.
 * The projection never infers enablement from map/regulation IDs and never
 * invents dice sides, entropy, roulette membership, legality, or execution.
 *
 * Missing, malformed, or non-explicit authority fails closed to the Basic
 * Battle baseline: no dice and no roulette.
 */
export function projectBattleOptionalRuleActivation(resolvedAuthorityContext = null) {
  if (!isPlainObject(resolvedAuthorityContext)) {
    return Object.freeze({
      authorityRef: null,
      dice: disabledRule('NO_RESOLVED_AUTHORITY'),
      roulette: disabledRule('NO_RESOLVED_AUTHORITY'),
    });
  }

  const authorityRef = canonicalAuthorityRef(resolvedAuthorityContext.authorityRef);
  const optionalRules = isPlainObject(resolvedAuthorityContext.optionalRules)
    ? resolvedAuthorityContext.optionalRules
    : null;

  if (!authorityRef || !optionalRules) {
    return Object.freeze({
      authorityRef: null,
      dice: disabledRule('NO_RESOLVED_AUTHORITY'),
      roulette: disabledRule('NO_RESOLVED_AUTHORITY'),
    });
  }

  return Object.freeze({
    authorityRef,
    dice: projectOneRule(optionalRules.dice),
    roulette: projectOneRule(optionalRules.roulette),
  });
}

export function isBattleOptionalRuleEnabled(projection, ruleKey) {
  if (!OPTIONAL_RULE_KEYS.includes(ruleKey)) return false;
  return projection?.[ruleKey]?.enabled === true;
}

export const BATTLE_OPTIONAL_RULE_ACTIVATION_CONTRACT = Object.freeze({
  basicDiceEnabled: false,
  basicRouletteEnabled: false,
  authorityPrecedenceResolution: 'CALLER',
  requiresCanonicalAuthorityRef: true,
  infersEnablementFromMapId: false,
  infersEnablementFromRegulationId: false,
  inventsRuleParameters: false,
  computesDiceRoll: false,
  computesMovementBudget: false,
  computesRouletteMembership: false,
  computesCardLegality: false,
  commitsCardAction: false,
  gameStateWrite: false,
  uiWrite: false,
});
