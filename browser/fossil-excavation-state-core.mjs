const SCHEMA = 'gameroad.fossil-excavation-state.v1';

const COUNT_THRESHOLDS = Object.freeze([
  Object.freeze({ upperExclusive: 0.75, value: 1 }),
  Object.freeze({ upperExclusive: 0.93, value: 2 }),
  Object.freeze({ upperExclusive: 0.98, value: 3 }),
  Object.freeze({ upperExclusive: 0.995, value: 4 }),
  Object.freeze({ upperExclusive: 1, value: 5 }),
]);

const VALUE_THRESHOLDS = Object.freeze([
  Object.freeze({ upperExclusive: 0.60, value: 1 }),
  Object.freeze({ upperExclusive: 0.90, value: 2 }),
  Object.freeze({ upperExclusive: 1, value: 3 }),
]);

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function requireString(value, label) {
  if (!nonEmptyString(value)) throw new TypeError(`${label.toUpperCase()}_REQUIRED`);
  return value;
}

function requireSafeInteger(value, label, { min = 0 } = {}) {
  if (!Number.isSafeInteger(value) || value < min) {
    throw new TypeError(`${label.toUpperCase()}_INVALID`);
  }
  return value;
}

function requireRoll(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value >= 1) {
    throw new TypeError(`${label.toUpperCase()}_INVALID`);
  }
  return value;
}

function deepClone(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(deepClone);
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, deepClone(child)]));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function cloneFossil(fossil) {
  return {
    id: fossil.id,
    excavationId: fossil.excavationId,
    stratumId: fossil.stratumId,
    ownerId: fossil.ownerId,
    excavatedRound: fossil.excavatedRound,
    restorationValue: fossil.restorationValue,
  };
}

function cloneExcavation(excavation) {
  return {
    excavationId: excavation.excavationId,
    stratumId: excavation.stratumId,
    ownerId: excavation.ownerId,
    round: excavation.round,
    fossils: excavation.fossils.map(cloneFossil),
  };
}

function cloneRestoration(restoration) {
  return {
    restorationId: restoration.restorationId,
    matchId: restoration.matchId,
    round: restoration.round,
    phase: restoration.phase,
    sequence: restoration.sequence,
    ownerId: restoration.ownerId,
    dinosaurCardId: restoration.dinosaurCardId,
    dinosaurSource: restoration.dinosaurSource,
    fossils: restoration.fossils.map(cloneFossil),
    totalValue: restoration.totalValue,
    success: restoration.success,
  };
}

function cloneState(raw) {
  return {
    schema: raw.schema,
    matchId: raw.matchId,
    excavations: raw.excavations.map(cloneExcavation),
    availableFossilIds: [...raw.availableFossilIds],
    restorations: raw.restorations.map(cloneRestoration),
  };
}

function normalizeFossil(fossil) {
  if (!fossil || typeof fossil !== 'object' || Array.isArray(fossil)) throw new TypeError('FOSSIL_INVALID');
  const normalized = {
    id: requireString(fossil.id, 'fossilId'),
    excavationId: requireString(fossil.excavationId, 'excavationId'),
    stratumId: requireString(fossil.stratumId, 'stratumId'),
    ownerId: requireString(fossil.ownerId, 'ownerId'),
    excavatedRound: requireSafeInteger(fossil.excavatedRound, 'excavatedRound'),
    restorationValue: requireSafeInteger(fossil.restorationValue, 'restorationValue', { min: 1 }),
  };
  if (normalized.restorationValue > 3) throw new TypeError('RESTORATION_VALUE_INVALID');
  return normalized;
}

function normalizeExcavation(excavation) {
  if (!excavation || typeof excavation !== 'object' || Array.isArray(excavation)) {
    throw new TypeError('EXCAVATION_INVALID');
  }
  const normalized = {
    excavationId: requireString(excavation.excavationId, 'excavationId'),
    stratumId: requireString(excavation.stratumId, 'stratumId'),
    ownerId: requireString(excavation.ownerId, 'ownerId'),
    round: requireSafeInteger(excavation.round, 'round'),
    fossils: Array.isArray(excavation.fossils) ? excavation.fossils.map(normalizeFossil) : null,
  };
  if (!normalized.fossils || normalized.fossils.length < 1 || normalized.fossils.length > 5) {
    throw new TypeError('EXCAVATION_FOSSILS_INVALID');
  }
  for (const fossil of normalized.fossils) {
    if (fossil.excavationId !== normalized.excavationId) throw new TypeError('FOSSIL_EXCAVATION_MISMATCH');
    if (fossil.stratumId !== normalized.stratumId) throw new TypeError('FOSSIL_STRATUM_MISMATCH');
    if (fossil.ownerId !== normalized.ownerId) throw new TypeError('FOSSIL_OWNER_MISMATCH');
    if (fossil.excavatedRound !== normalized.round) throw new TypeError('FOSSIL_ROUND_MISMATCH');
  }
  return normalized;
}

function normalizeRestoration(restoration, matchId) {
  if (!restoration || typeof restoration !== 'object' || Array.isArray(restoration)) {
    throw new TypeError('RESTORATION_INVALID');
  }
  const normalized = {
    restorationId: requireString(restoration.restorationId, 'restorationId'),
    matchId: requireString(restoration.matchId, 'matchId'),
    round: requireSafeInteger(restoration.round, 'round'),
    phase: requireString(restoration.phase, 'phase'),
    sequence: requireSafeInteger(restoration.sequence, 'sequence'),
    ownerId: requireString(restoration.ownerId, 'ownerId'),
    dinosaurCardId: requireString(restoration.dinosaurCardId, 'dinosaurCardId'),
    dinosaurSource: restoration.dinosaurSource,
    fossils: Array.isArray(restoration.fossils) ? restoration.fossils.map(normalizeFossil) : null,
    totalValue: requireSafeInteger(restoration.totalValue, 'totalValue', { min: 1 }),
    success: restoration.success,
  };
  if (normalized.matchId !== matchId) throw new TypeError('RESTORATION_MATCH_MISMATCH');
  if (!['hand', 'graveyard'].includes(normalized.dinosaurSource)) throw new TypeError('DINOSAUR_SOURCE_INVALID');
  if (!normalized.fossils || normalized.fossils.length < 1 || normalized.fossils.length > 3) {
    throw new TypeError('RESTORATION_FOSSILS_INVALID');
  }
  if (normalized.fossils.some(fossil => fossil.ownerId !== normalized.ownerId)) {
    throw new TypeError('RESTORATION_FOSSIL_OWNER_MISMATCH');
  }
  const total = normalized.fossils.reduce((sum, fossil) => sum + fossil.restorationValue, 0);
  if (total !== normalized.totalValue) throw new TypeError('RESTORATION_TOTAL_MISMATCH');
  if (normalized.success !== true) throw new TypeError('RESTORATION_SUCCESS_INVALID');
  return normalized;
}

function assertUniqueStrings(values, label) {
  if (!Array.isArray(values) || values.some(value => !nonEmptyString(value)) || new Set(values).size !== values.length) {
    throw new TypeError(`${label}_INVALID`);
  }
}

function assertState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new TypeError('STATE_REQUIRED');
  if (state.schema !== SCHEMA) throw new TypeError('STATE_SCHEMA_UNSUPPORTED');
  requireString(state.matchId, 'matchId');
  if (!Array.isArray(state.excavations)) throw new TypeError('EXCAVATIONS_INVALID');
  if (!Array.isArray(state.restorations)) throw new TypeError('RESTORATIONS_INVALID');

  const excavations = state.excavations.map(normalizeExcavation);
  const excavationIds = excavations.map(entry => entry.excavationId);
  const stratumIds = excavations.map(entry => entry.stratumId);
  assertUniqueStrings(excavationIds, 'EXCAVATION_IDS');
  assertUniqueStrings(stratumIds, 'EXCAVATED_STRATUM_IDS');

  const issuedFossils = excavations.flatMap(entry => entry.fossils);
  const fossilIds = issuedFossils.map(fossil => fossil.id);
  assertUniqueStrings(fossilIds, 'FOSSIL_IDS');
  assertUniqueStrings(state.availableFossilIds, 'AVAILABLE_FOSSIL_IDS');
  const issuedIdSet = new Set(fossilIds);
  if (state.availableFossilIds.some(id => !issuedIdSet.has(id))) throw new TypeError('AVAILABLE_FOSSIL_UNKNOWN');

  const restorations = state.restorations.map(entry => normalizeRestoration(entry, state.matchId));
  const restorationIds = restorations.map(entry => entry.restorationId);
  assertUniqueStrings(restorationIds, 'RESTORATION_IDS');

  const consumedIds = restorations.flatMap(entry => entry.fossils.map(fossil => fossil.id));
  if (new Set(consumedIds).size !== consumedIds.length) throw new TypeError('FOSSIL_CONSUMED_TWICE');
  if (consumedIds.some(id => !issuedIdSet.has(id))) throw new TypeError('RESTORATION_FOSSIL_UNKNOWN');
  const availableSet = new Set(state.availableFossilIds);
  if (consumedIds.some(id => availableSet.has(id))) throw new TypeError('CONSUMED_FOSSIL_STILL_AVAILABLE');

  const issuedById = new Map(issuedFossils.map(fossil => [fossil.id, fossil]));
  for (const restoration of restorations) {
    for (const fossil of restoration.fossils) {
      const issued = issuedById.get(fossil.id);
      if (JSON.stringify(issued) !== JSON.stringify(fossil)) throw new TypeError('RESTORATION_PROVENANCE_MISMATCH');
    }
  }
  return state;
}

function freezeState(raw) {
  return deepFreeze(cloneState(assertState(raw)));
}

function decision(state, status, reason, effects = null) {
  return deepFreeze({ state, status, reason, effects: effects ? deepClone(effects) : null });
}

function mapRoll(roll, thresholds, label) {
  requireRoll(roll, label);
  for (const threshold of thresholds) {
    if (roll < threshold.upperExclusive) return threshold.value;
  }
  throw new TypeError(`${label.toUpperCase()}_UNMAPPED`);
}

function fossilId(matchId, excavationId, index) {
  return `fossil:${encodeURIComponent(matchId)}:${encodeURIComponent(excavationId)}:${index + 1}`;
}

function allIssuedFossils(state) {
  return state.excavations.flatMap(entry => entry.fossils);
}

function availableFossils(state) {
  const available = new Set(state.availableFossilIds);
  return allIssuedFossils(state).filter(fossil => available.has(fossil.id));
}

export function sampleFossilCount(roll) {
  return mapRoll(roll, COUNT_THRESHOLDS, 'countRoll');
}

export function sampleRestorationValue(roll) {
  return mapRoll(roll, VALUE_THRESHOLDS, 'valueRoll');
}

export function createFossilExcavationState({ matchId } = {}) {
  requireString(matchId, 'matchId');
  return freezeState({
    schema: SCHEMA,
    matchId,
    excavations: [],
    availableFossilIds: [],
    restorations: [],
  });
}

export function loadFossilExcavationState(snapshot) {
  return freezeState(deepClone(snapshot));
}

export function serializeFossilExcavationState(state) {
  assertState(state);
  return deepClone(state);
}

export function issueFossilsFromExcavation(state, {
  excavationId,
  stratumId,
  ownerId,
  round,
  stopAuthorized,
  countRoll,
  valueRolls,
} = {}) {
  assertState(state);
  requireString(excavationId, 'excavationId');
  requireString(stratumId, 'stratumId');
  requireString(ownerId, 'ownerId');
  requireSafeInteger(round, 'round');

  const priorEvent = state.excavations.find(entry => entry.excavationId === excavationId);
  if (priorEvent) return decision(state, 'duplicate', 'EXCAVATION_ALREADY_APPLIED', {
    fossilIds: priorEvent.fossils.map(fossil => fossil.id),
  });
  if (state.excavations.some(entry => entry.stratumId === stratumId)) {
    return decision(state, 'duplicate', 'STRATUM_ALREADY_EXCAVATED');
  }
  if (stopAuthorized !== true) return decision(state, 'rejected', 'STOP_NOT_AUTHORIZED');

  const count = sampleFossilCount(countRoll);
  if (!Array.isArray(valueRolls) || valueRolls.length < count) throw new TypeError('VALUE_ROLLS_INSUFFICIENT');
  const fossils = Array.from({ length: count }, (_, index) => ({
    id: fossilId(state.matchId, excavationId, index),
    excavationId,
    stratumId,
    ownerId,
    excavatedRound: round,
    restorationValue: sampleRestorationValue(valueRolls[index]),
  }));

  const existingIds = new Set(allIssuedFossils(state).map(fossil => fossil.id));
  if (fossils.some(fossil => existingIds.has(fossil.id))) throw new TypeError('FOSSIL_ID_COLLISION');

  const next = freezeState({
    ...cloneState(state),
    excavations: [...state.excavations.map(cloneExcavation), {
      excavationId,
      stratumId,
      ownerId,
      round,
      fossils,
    }],
    availableFossilIds: [...state.availableFossilIds, ...fossils.map(fossil => fossil.id)],
  });
  return decision(next, 'accepted', 'FOSSILS_ISSUED', {
    fossilIds: fossils.map(fossil => fossil.id),
    count,
  });
}

export function listAvailableFossils(state, { ownerId = null } = {}) {
  assertState(state);
  if (ownerId !== null) requireString(ownerId, 'ownerId');
  const fossils = availableFossils(state)
    .filter(fossil => ownerId === null || fossil.ownerId === ownerId)
    .map(cloneFossil);
  return deepFreeze(fossils);
}

export function findRestorationChoices(state, { ownerId, targetValue } = {}) {
  assertState(state);
  requireString(ownerId, 'ownerId');
  requireSafeInteger(targetValue, 'targetValue', { min: 1 });
  const fossils = availableFossils(state)
    .filter(fossil => fossil.ownerId === ownerId)
    .sort((a, b) => a.id.localeCompare(b.id));
  const choices = [];

  function search(start, selected, total) {
    if (selected.length >= 1 && total === targetValue) {
      choices.push({
        fossilIds: selected.map(fossil => fossil.id),
        restorationValues: selected.map(fossil => fossil.restorationValue),
        totalValue: total,
      });
    }
    if (selected.length === 3 || total >= targetValue) return;
    for (let index = start; index < fossils.length; index += 1) {
      const fossil = fossils[index];
      search(index + 1, [...selected, fossil], total + fossil.restorationValue);
    }
  }

  search(0, [], 0);
  choices.sort((a, b) => a.fossilIds.join('|').localeCompare(b.fossilIds.join('|')));
  return deepFreeze(choices);
}

export function consumeFossilsForRestoration(state, {
  restorationId,
  ownerId,
  dinosaurCardId,
  dinosaurSource,
  round,
  phase,
  sequence,
  targetValue,
  fossilIds,
  restorationAuthorized,
} = {}) {
  assertState(state);
  requireString(restorationId, 'restorationId');
  requireString(ownerId, 'ownerId');
  requireString(dinosaurCardId, 'dinosaurCardId');
  requireString(phase, 'phase');
  requireSafeInteger(round, 'round');
  requireSafeInteger(sequence, 'sequence');
  requireSafeInteger(targetValue, 'targetValue', { min: 1 });
  if (!['hand', 'graveyard'].includes(dinosaurSource)) throw new TypeError('DINOSAUR_SOURCE_INVALID');

  const prior = state.restorations.find(entry => entry.restorationId === restorationId);
  if (prior) return decision(state, 'duplicate', 'RESTORATION_ALREADY_APPLIED', {
    restorationId: prior.restorationId,
  });
  if (restorationAuthorized !== true) return decision(state, 'rejected', 'RESTORATION_NOT_AUTHORIZED');
  if (!Array.isArray(fossilIds) || fossilIds.length < 1 || fossilIds.length > 3) {
    return decision(state, 'rejected', 'FOSSIL_SELECTION_COUNT_INVALID');
  }
  if (fossilIds.some(id => !nonEmptyString(id)) || new Set(fossilIds).size !== fossilIds.length) {
    return decision(state, 'rejected', 'FOSSIL_SELECTION_IDS_INVALID');
  }

  const availableById = new Map(availableFossils(state).map(fossil => [fossil.id, fossil]));
  const selected = fossilIds.map(id => availableById.get(id));
  if (selected.some(fossil => !fossil)) return decision(state, 'rejected', 'FOSSIL_NOT_AVAILABLE');
  if (selected.some(fossil => fossil.ownerId !== ownerId)) return decision(state, 'rejected', 'FOSSIL_NOT_OWNED');
  const totalValue = selected.reduce((sum, fossil) => sum + fossil.restorationValue, 0);
  if (totalValue !== targetValue) return decision(state, 'rejected', 'RESTORATION_VALUE_MISMATCH');

  const selectedIds = new Set(fossilIds);
  const record = {
    restorationId,
    matchId: state.matchId,
    round,
    phase,
    sequence,
    ownerId,
    dinosaurCardId,
    dinosaurSource,
    fossils: selected.map(cloneFossil),
    totalValue,
    success: true,
  };
  const next = freezeState({
    ...cloneState(state),
    availableFossilIds: state.availableFossilIds.filter(id => !selectedIds.has(id)),
    restorations: [...state.restorations.map(cloneRestoration), record],
  });
  return decision(next, 'accepted', 'RESTORATION_COMMITTED', {
    restorationId,
    consumedFossilIds: [...fossilIds],
    totalValue,
  });
}

export const FOSSIL_EXCAVATION_STATE_CORE = deepFreeze({
  schema: SCHEMA,
  fossilCountDistribution: [
    { value: 1, probability: 0.75 },
    { value: 2, probability: 0.18 },
    { value: 3, probability: 0.05 },
    { value: 4, probability: 0.015 },
    { value: 5, probability: 0.005 },
  ],
  restorationValueDistribution: [
    { value: 1, probability: 0.60 },
    { value: 2, probability: 0.30 },
    { value: 3, probability: 0.10 },
  ],
  maxRestorationFossils: 3,
  ownsRandomness: false,
  ownsBoardStopAuthority: false,
  ownsPersistenceTransport: false,
});
