export const BATTLE_RULE_PROFILE_SCHEMA = 'gameroad.battle-rule-profile.v1';

const PROFILE_LEVEL_BLOCKS = new Set(['PROFILE', 'mode', 'ruleset', 'progression']);

const KNOWN_MODULE_REQUIREMENTS = Object.freeze({
  dice: Object.freeze(['movementBudgetConsumer']),
  roulette: Object.freeze(['playableCandidateProjection', 'cardCommitAuthority']),
});

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireCanonicalString(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    throw new TypeError(`${label} must be a non-empty canonical string`);
  }
  return value;
}

function requireBoolean(value, label) {
  if (typeof value !== 'boolean') {
    throw new TypeError(`${label} must be boolean`);
  }
  return value;
}

function cloneJsonLike(value, label = 'value') {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${label} must contain finite numbers`);
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) => cloneJsonLike(entry, `${label}[${index}]`));
  }
  if (!isPlainObject(value)) {
    throw new TypeError(`${label} must be JSON-like`);
  }
  const result = {};
  for (const key of Object.keys(value).sort()) {
    result[key] = cloneJsonLike(value[key], `${label}.${key}`);
  }
  return result;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const entry of Object.values(value)) deepFreeze(entry);
  return Object.freeze(value);
}

function canonicalStringSet(values, label) {
  if (values === undefined) return [];
  if (!Array.isArray(values)) throw new TypeError(`${label} must be an array`);
  const normalized = values.map((value, index) => requireCanonicalString(value, `${label}[${index}]`));
  return [...new Set(normalized)].sort();
}

function normalizeMode(rawMode) {
  if (!isPlainObject(rawMode)) throw new TypeError('mode must be an object');
  const id = requireCanonicalString(rawMode.id, 'mode.id');
  const result = { id };
  for (const [key, value] of Object.entries(rawMode)) {
    if (key === 'id') continue;
    result[key] = cloneJsonLike(value, `mode.${key}`);
  }
  return result;
}

function normalizeRuleset(rawRuleset) {
  if (!isPlainObject(rawRuleset)) throw new TypeError('ruleset must be an object');
  const id = requireCanonicalString(rawRuleset.id, 'ruleset.id');
  const result = { id };
  for (const [key, value] of Object.entries(rawRuleset)) {
    if (key === 'id') continue;
    result[key] = cloneJsonLike(value, `ruleset.${key}`);
  }
  return result;
}

function normalizeProgression(rawProgression) {
  if (!isPlainObject(rawProgression)) throw new TypeError('progression must be an object');
  const threshold = rawProgression.threshold;
  if (!Number.isSafeInteger(threshold) || threshold <= 0) {
    throw new TypeError('progression.threshold must be a positive safe integer');
  }
  const onComplete = requireCanonicalString(rawProgression.onComplete, 'progression.onComplete');
  const terminalEvent = requireCanonicalString(rawProgression.terminalEvent, 'progression.terminalEvent');
  if (terminalEvent === 'PROGRESSION_COMPLETED') {
    throw new TypeError('progression completion and terminal event must remain distinct');
  }
  const result = { threshold, onComplete, terminalEvent };
  for (const [key, value] of Object.entries(rawProgression)) {
    if (key === 'threshold' || key === 'onComplete' || key === 'terminalEvent') continue;
    result[key] = cloneJsonLike(value, `progression.${key}`);
  }
  return result;
}

function normalizeModules(rawModules = {}) {
  if (!isPlainObject(rawModules)) throw new TypeError('modules must be an object');
  const modules = {};
  for (const key of Object.keys(rawModules).sort()) {
    const rawModule = rawModules[key];
    if (!isPlainObject(rawModule)) throw new TypeError(`modules.${key} must be an object`);
    const enabled = requireBoolean(rawModule.enabled, `modules.${key}.enabled`);
    const requiredForMatch = enabled
      ? requireBoolean(rawModule.requiredForMatch, `modules.${key}.requiredForMatch`)
      : false;
    const requiredCapabilities = canonicalStringSet(rawModule.requiredCapabilities, `modules.${key}.requiredCapabilities`);
    const affordances = canonicalStringSet(rawModule.affordances, `modules.${key}.affordances`);
    modules[key] = {
      enabled,
      requiredForMatch,
      requiredCapabilities,
      affordances,
      parameters: rawModule.parameters === undefined ? null : cloneJsonLike(rawModule.parameters, `modules.${key}.parameters`),
    };
  }
  return modules;
}

function normalizeUnresolved(rawUnresolved = []) {
  if (!Array.isArray(rawUnresolved)) throw new TypeError('unresolved must be an array');
  const normalized = rawUnresolved.map((entry, index) => {
    if (!isPlainObject(entry)) throw new TypeError(`unresolved[${index}] must be an object`);
    return {
      atom: requireCanonicalString(entry.atom, `unresolved[${index}].atom`),
      blocks: canonicalStringSet(entry.blocks, `unresolved[${index}].blocks`),
      reason: entry.reason === undefined ? null : requireCanonicalString(entry.reason, `unresolved[${index}].reason`),
    };
  });
  normalized.sort((left, right) => {
    const atom = left.atom.localeCompare(right.atom);
    if (atom !== 0) return atom;
    return left.blocks.join('\u0000').localeCompare(right.blocks.join('\u0000'));
  });
  return normalized;
}

function normalizeLineage(rawLineage = []) {
  if (!Array.isArray(rawLineage)) throw new TypeError('lineage must be an array');
  return rawLineage.map((entry, index) => {
    if (!isPlainObject(entry)) throw new TypeError(`lineage[${index}] must be an object`);
    const normalized = cloneJsonLike(entry, `lineage[${index}]`);
    if ('origin' in normalized) requireCanonicalString(normalized.origin, `lineage[${index}].origin`);
    if ('currentStatus' in normalized) requireCanonicalString(normalized.currentStatus, `lineage[${index}].currentStatus`);
    return normalized;
  });
}

function stableSerialize(value) {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
}

function fnv1a64(text) {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  const bytes = new TextEncoder().encode(text);
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}

function semanticFingerprintInput(profile) {
  return {
    schema: profile.schema,
    authorityRef: profile.authorityRef,
    rulesVersion: profile.rulesVersion,
    invariants: profile.invariants,
    mode: profile.mode,
    ruleset: profile.ruleset,
    topology: profile.topology,
    progression: profile.progression,
    modules: profile.modules,
    parameters: profile.parameters,
    capabilities: profile.capabilities,
    unresolved: profile.unresolved,
    eventContract: profile.eventContract,
  };
}

export function buildBattleRuleFingerprint(profile) {
  if (!profile || profile.schema !== BATTLE_RULE_PROFILE_SCHEMA) {
    throw new TypeError('profile must be a resolved Battle rule profile');
  }
  return `brp1:${fnv1a64(stableSerialize(semanticFingerprintInput(profile)))}`;
}

export function resolveBattleRuleProfile(rawInput) {
  if (!isPlainObject(rawInput)) throw new TypeError('Battle rule profile input must be an object');
  if (rawInput.invariants?.noDefeat === false) {
    throw new TypeError('NO_DEFEAT is an invariant and cannot be disabled by a ruleset');
  }

  const profile = {
    schema: BATTLE_RULE_PROFILE_SCHEMA,
    authorityRef: requireCanonicalString(rawInput.authorityRef, 'authorityRef'),
    rulesVersion: requireCanonicalString(rawInput.rulesVersion, 'rulesVersion'),
    invariants: {
      ...(isPlainObject(rawInput.invariants) ? cloneJsonLike(rawInput.invariants, 'invariants') : {}),
      noDefeat: true,
    },
    mode: normalizeMode(rawInput.mode),
    ruleset: normalizeRuleset(rawInput.ruleset),
    topology: rawInput.topology === undefined ? {} : cloneJsonLike(rawInput.topology, 'topology'),
    progression: normalizeProgression(rawInput.progression),
    modules: normalizeModules(rawInput.modules),
    parameters: rawInput.parameters === undefined ? {} : cloneJsonLike(rawInput.parameters, 'parameters'),
    capabilities: canonicalStringSet(rawInput.capabilities, 'capabilities'),
    unresolved: normalizeUnresolved(rawInput.unresolved),
    lineage: normalizeLineage(rawInput.lineage),
    eventContract: {
      progressionCompleted: 'PROGRESSION_COMPLETED',
      goalPathConnected: 'GOAL_PATH_CONNECTED',
      terminal: requireCanonicalString(rawInput.progression.terminalEvent, 'progression.terminalEvent'),
    },
  };

  const fingerprint = buildBattleRuleFingerprint(profile);
  profile.fingerprint = fingerprint;
  return deepFreeze(profile);
}

function missingCapabilities(profile, required) {
  const present = new Set(profile.capabilities);
  return required.filter((capability) => !present.has(capability));
}

function moduleRequirements(moduleKey, module) {
  return [...new Set([
    ...(KNOWN_MODULE_REQUIREMENTS[moduleKey] ?? []),
    ...module.requiredCapabilities,
  ])].sort();
}

function unresolvedBlockMap(profile) {
  const blockedBy = new Map();
  for (const entry of profile.unresolved) {
    for (const subject of entry.blocks) {
      if (!blockedBy.has(subject)) blockedBy.set(subject, []);
      blockedBy.get(subject).push(entry.atom);
    }
  }
  for (const atoms of blockedBy.values()) atoms.sort();
  return blockedBy;
}

export function preflightBattleRuleProfile(profile) {
  if (!profile || profile.schema !== BATTLE_RULE_PROFILE_SCHEMA || typeof profile.fingerprint !== 'string') {
    throw new TypeError('profile must be a resolved Battle rule profile');
  }

  const errors = [];
  const blockedModules = [];
  const blockedBy = unresolvedBlockMap(profile);

  for (const subject of PROFILE_LEVEL_BLOCKS) {
    if (!blockedBy.has(subject)) continue;
    errors.push({
      code: 'UNRESOLVED_REQUIRED_PROFILE_ATOM',
      subject,
      atoms: [...blockedBy.get(subject)],
    });
  }

  if (profile.progression.onComplete === 'CONNECT_GOAL_PATH') {
    const required = ['goalTopology', 'goalPathProducer', 'goalReachedProducer'];
    const missing = missingCapabilities(profile, required);
    if (missing.length > 0) {
      errors.push({
        code: 'MISSING_REQUIRED_CAPABILITY',
        subject: 'progression:CONNECT_GOAL_PATH',
        missing,
      });
    }
  }

  if (profile.mode.id === '2V2') {
    const missing = missingCapabilities(profile, ['teamAwareTargetProjection']);
    if (missing.length > 0) {
      errors.push({
        code: 'MISSING_REQUIRED_CAPABILITY',
        subject: 'mode:2V2',
        missing,
      });
    }
  }

  for (const [moduleKey, module] of Object.entries(profile.modules)) {
    if (!module.enabled) continue;
    const unresolvedAtoms = blockedBy.get(moduleKey) ?? [];
    if (unresolvedAtoms.length > 0) {
      blockedModules.push(moduleKey);
      if (module.requiredForMatch) {
        errors.push({
          code: 'UNRESOLVED_REQUIRED_MODULE',
          subject: moduleKey,
          atoms: [...unresolvedAtoms],
        });
      }
    }

    const required = moduleRequirements(moduleKey, module);
    const missing = missingCapabilities(profile, required);
    if (missing.length > 0) {
      blockedModules.push(moduleKey);
      if (module.requiredForMatch) {
        errors.push({
          code: 'MISSING_REQUIRED_CAPABILITY',
          subject: `module:${moduleKey}`,
          missing,
        });
      }
    }
  }

  const uniqueBlockedModules = [...new Set(blockedModules)].sort();
  const status = errors.length > 0
    ? 'INVALID_COMPOSITION'
    : uniqueBlockedModules.length > 0
      ? 'READY_WITH_LOCAL_BLOCKS'
      : 'READY';

  return deepFreeze({
    status,
    matchStartAllowed: errors.length === 0,
    fingerprint: profile.fingerprint,
    errors,
    blockedModules: uniqueBlockedModules,
  });
}

export function projectBattleRuleAffordances(profile, preflight = preflightBattleRuleProfile(profile)) {
  if (preflight.fingerprint !== profile.fingerprint) {
    throw new TypeError('preflight fingerprint must match profile');
  }
  if (!preflight.matchStartAllowed) return Object.freeze([]);

  const blocked = new Set(preflight.blockedModules);
  const affordances = new Set();

  if (profile.progression.onComplete === 'CONNECT_GOAL_PATH') {
    affordances.add('progression.goalGate');
  }
  if (profile.mode.id === '2V2') affordances.add('team.targeting');

  for (const [moduleKey, module] of Object.entries(profile.modules)) {
    if (!module.enabled || blocked.has(moduleKey)) continue;
    for (const affordance of module.affordances) affordances.add(affordance);
  }

  return Object.freeze([...affordances].sort());
}

export const BATTLE_RULE_PROFILE_RESOLUTION_CONTRACT = Object.freeze({
  noDefeatInvariant: true,
  progressionThresholdIndependentFromConsequence: true,
  progressionCompletionIndependentFromTerminal: true,
  unresolvedFailsClosedLocally: true,
  legacyLineageIsFallbackAuthority: false,
  resolvesGameplayLegality: false,
  computesTargets: false,
  computesMovement: false,
  computesWinner: false,
  gameStateWrite: false,
  uiWrite: false,
  saveWrite: false,
  networkWrite: false,
});
