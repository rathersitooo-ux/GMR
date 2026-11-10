import { createDeckMatchStartSnapshot } from './deck-save-ack-core.mjs';

const SCHEMA = 'gameroad.auto-rank-season-registration.v1';
const MATCH_START_SCHEMA = 'gameroad.browser.match-start-snapshot.v1';

export const AUTO_RANK_SEASON_PHASE = Object.freeze({
  REGISTRATION: 'REGISTRATION',
  OPENING: 'OPENING',
  REGULAR: 'REGULAR',
  FINAL: 'FINAL',
  CLOSED: 'CLOSED',
});

const PHASE_ORDER = Object.freeze([
  AUTO_RANK_SEASON_PHASE.REGISTRATION,
  AUTO_RANK_SEASON_PHASE.OPENING,
  AUTO_RANK_SEASON_PHASE.REGULAR,
  AUTO_RANK_SEASON_PHASE.FINAL,
  AUTO_RANK_SEASON_PHASE.CLOSED,
]);
const PHASE_INDEX = new Map(PHASE_ORDER.map((phase, index) => [phase, index]));

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function requireNonEmptyString(value, label) {
  if (!nonEmptyString(value)) throw new TypeError(`${label.toUpperCase()}_REQUIRED`);
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function assertSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new TypeError('REGISTRATION_SNAPSHOT_REQUIRED');
  }
  if (snapshot.schema !== MATCH_START_SCHEMA) {
    throw new TypeError('REGISTRATION_SNAPSHOT_SCHEMA_UNSUPPORTED');
  }
  if (snapshot.setup?.mode !== '4p') {
    throw new TypeError('AUTO_RANK_REQUIRES_4P');
  }
  return snapshot;
}

function assertInheritedFrom(value) {
  if (value === null) return value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('INHERITED_FROM_INVALID');
  }
  if (value.lane !== 'OPENING') throw new TypeError('INHERITED_FROM_LANE_INVALID');
  if (!Number.isSafeInteger(value.revision) || value.revision < 1) {
    throw new TypeError('INHERITED_FROM_REVISION_INVALID');
  }
  return value;
}

function assertRegistration(registration, lane) {
  if (registration === null) return registration;
  if (!registration || typeof registration !== 'object' || Array.isArray(registration)) {
    throw new TypeError(`${lane}_REGISTRATION_INVALID`);
  }
  if (registration.lane !== lane) throw new TypeError(`${lane}_REGISTRATION_LANE_INVALID`);
  if (!Number.isSafeInteger(registration.revision) || registration.revision < 1) {
    throw new TypeError(`${lane}_REGISTRATION_REVISION_INVALID`);
  }
  requireNonEmptyString(registration.registeredAt, `${lane}_registeredAt`);
  assertInheritedFrom(registration.inheritedFrom);
  assertSnapshot(registration.snapshot);
  return registration;
}

function assertState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new TypeError('AUTO_RANK_SEASON_STATE_REQUIRED');
  }
  if (state.schema !== SCHEMA) throw new TypeError('AUTO_RANK_SEASON_STATE_SCHEMA_UNSUPPORTED');
  requireNonEmptyString(state.seasonId, 'seasonId');
  requireNonEmptyString(state.competitionId, 'competitionId');
  if (!state.versions || typeof state.versions !== 'object' || Array.isArray(state.versions)) {
    throw new TypeError('VERSIONS_REQUIRED');
  }
  requireNonEmptyString(state.versions.rulesVersion, 'rulesVersion');
  requireNonEmptyString(state.versions.cardVersion, 'cardVersion');
  requireNonEmptyString(state.versions.aiVersion, 'aiVersion');

  const phaseIndex = PHASE_INDEX.get(state.phase);
  if (phaseIndex === undefined) throw new TypeError('AUTO_RANK_SEASON_PHASE_INVALID');
  if (!Number.isSafeInteger(state.phaseRevision) || state.phaseRevision !== phaseIndex) {
    throw new TypeError('AUTO_RANK_SEASON_PHASE_REVISION_INVALID');
  }

  assertRegistration(state.openingRegistration, 'OPENING');
  assertRegistration(state.regularRegistration, 'REGULAR');

  if (state.phase === AUTO_RANK_SEASON_PHASE.REGISTRATION) {
    if (state.regularRegistration !== null) throw new TypeError('REGULAR_REGISTRATION_TOO_EARLY');
  } else if (state.phase === AUTO_RANK_SEASON_PHASE.OPENING) {
    if (state.openingRegistration === null) throw new TypeError('OPENING_REGISTRATION_REQUIRED');
    if (state.regularRegistration !== null) throw new TypeError('REGULAR_REGISTRATION_TOO_EARLY');
  } else {
    if (state.openingRegistration === null) throw new TypeError('OPENING_REGISTRATION_REQUIRED');
    if (state.regularRegistration === null) throw new TypeError('REGULAR_REGISTRATION_REQUIRED');
  }
  return state;
}

function freezeState(raw) {
  return deepFreeze(assertState(raw));
}

function requireFourPlayerSelection(selection) {
  if (!selection || typeof selection !== 'object' || Array.isArray(selection)) {
    throw new TypeError('AUTO_RANK_SELECTION_REQUIRED');
  }
  if (selection.setupMode !== '4p') throw new TypeError('AUTO_RANK_REQUIRES_4P');
  return selection;
}

function createRegistrationSnapshot(selection, validateDeck) {
  requireFourPlayerSelection(selection);
  const snapshot = createDeckMatchStartSnapshot(selection, { validateDeck });
  return assertSnapshot(snapshot);
}

function nextPhase(phase) {
  const index = PHASE_INDEX.get(phase);
  return index === undefined || index >= PHASE_ORDER.length - 1 ? null : PHASE_ORDER[index + 1];
}

export function createAutoRankSeasonRegistrationState({
  seasonId,
  competitionId,
  rulesVersion,
  cardVersion,
  aiVersion,
} = {}) {
  requireNonEmptyString(seasonId, 'seasonId');
  requireNonEmptyString(competitionId, 'competitionId');
  requireNonEmptyString(rulesVersion, 'rulesVersion');
  requireNonEmptyString(cardVersion, 'cardVersion');
  requireNonEmptyString(aiVersion, 'aiVersion');

  return freezeState({
    schema: SCHEMA,
    seasonId,
    competitionId,
    versions: { rulesVersion, cardVersion, aiVersion },
    phase: AUTO_RANK_SEASON_PHASE.REGISTRATION,
    phaseRevision: 0,
    openingRegistration: null,
    regularRegistration: null,
  });
}

export function registerOpeningDeck(state, {
  selection,
  registeredAt,
  validateDeck,
} = {}) {
  assertState(state);
  if (state.phase !== AUTO_RANK_SEASON_PHASE.REGISTRATION) {
    throw new Error('OPENING_REGISTRATION_CLOSED');
  }
  requireNonEmptyString(registeredAt, 'registeredAt');
  const snapshot = createRegistrationSnapshot(selection, validateDeck);
  const revision = (state.openingRegistration?.revision ?? 0) + 1;

  return freezeState({
    ...state,
    openingRegistration: {
      lane: 'OPENING',
      revision,
      registeredAt,
      inheritedFrom: null,
      snapshot,
    },
  });
}

export function advanceAutoRankSeasonPhase(state, { toPhase } = {}) {
  assertState(state);
  requireNonEmptyString(toPhase, 'toPhase');
  const expected = nextPhase(state.phase);
  if (expected === null) throw new Error('AUTO_RANK_SEASON_ALREADY_CLOSED');
  if (toPhase !== expected) throw new Error(`AUTO_RANK_SEASON_PHASE_TRANSITION_INVALID:${state.phase}->${toPhase}`);
  if (state.phase === AUTO_RANK_SEASON_PHASE.REGISTRATION && state.openingRegistration === null) {
    throw new Error('OPENING_REGISTRATION_REQUIRED');
  }

  let regularRegistration = state.regularRegistration;
  if (state.phase === AUTO_RANK_SEASON_PHASE.OPENING) {
    const opening = state.openingRegistration;
    regularRegistration = {
      lane: 'REGULAR',
      revision: 1,
      registeredAt: opening.registeredAt,
      inheritedFrom: { lane: 'OPENING', revision: opening.revision },
      snapshot: opening.snapshot,
    };
  }

  return freezeState({
    ...state,
    phase: toPhase,
    phaseRevision: state.phaseRevision + 1,
    regularRegistration,
  });
}

export function reregisterRegularDeck(state, {
  selection,
  registeredAt,
  validateDeck,
} = {}) {
  assertState(state);
  if (state.phase !== AUTO_RANK_SEASON_PHASE.REGULAR) {
    throw new Error('REGULAR_REREGISTRATION_NOT_OPEN');
  }
  requireNonEmptyString(registeredAt, 'registeredAt');
  const snapshot = createRegistrationSnapshot(selection, validateDeck);
  const revision = state.regularRegistration.revision + 1;

  return freezeState({
    ...state,
    regularRegistration: {
      lane: 'REGULAR',
      revision,
      registeredAt,
      inheritedFrom: null,
      snapshot,
    },
  });
}

export function getActiveAutoRankRegistration(state) {
  assertState(state);
  if (state.phase === AUTO_RANK_SEASON_PHASE.CLOSED) return null;
  if (state.phase === AUTO_RANK_SEASON_PHASE.REGISTRATION ||
      state.phase === AUTO_RANK_SEASON_PHASE.OPENING) {
    return state.openingRegistration;
  }
  return state.regularRegistration;
}

export const AUTO_RANK_SEASON_REGISTRATION_CORE = Object.freeze({
  schema: SCHEMA,
  phases: AUTO_RANK_SEASON_PHASE,
});
