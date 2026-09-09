import {
  createControlledCharacterMotionState,
  projectControlledCharacterMotion,
  transitionControlledCharacterMotion,
} from './battle-controlled-character-motion-core.mjs';

const DIRECTOR_SCHEMA = 'gameroad.battle-controlled-character-4p-motion-director.v1';
const PARTICIPANT_COUNT = 4;

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function normalizeInitialParticipants(participants) {
  if (!Array.isArray(participants) || participants.length !== PARTICIPANT_COUNT) {
    throw new TypeError('FOUR_CONTROLLED_PARTICIPANTS_REQUIRED');
  }

  const rows = participants.map((source) => {
    const participantId = nonEmptyString(source?.participantId) ? source.participantId.trim() : null;
    const characterId = nonEmptyString(source?.characterId) ? source.characterId.trim() : null;
    if (!participantId || !characterId) throw new TypeError('PARTICIPANT_AND_CHARACTER_ID_REQUIRED');
    return {
      participantId,
      characterId,
      positionKey: source?.positionKey ?? null,
      revision: source?.revision ?? 0,
      controlGeneration: source?.controlGeneration ?? 0,
    };
  });

  if (new Set(rows.map((row) => row.participantId)).size !== PARTICIPANT_COUNT) {
    throw new TypeError('FOUR_UNIQUE_PARTICIPANTS_REQUIRED');
  }
  return rows;
}

function validDirectorState(state) {
  return state?.schema === DIRECTOR_SCHEMA
    && Array.isArray(state.participantOrder)
    && state.participantOrder.length === PARTICIPANT_COUNT
    && state.stateByParticipant
    && typeof state.stateByParticipant === 'object';
}

function copyStateMap(state) {
  return Object.fromEntries(
    state.participantOrder.map((participantId) => [participantId, state.stateByParticipant[participantId]]),
  );
}

export function createFourParticipantControlledCharacterMotionState({ participants } = {}) {
  const rows = normalizeInitialParticipants(participants);
  const stateByParticipant = Object.fromEntries(rows.map((row) => [
    row.participantId,
    createControlledCharacterMotionState(row),
  ]));

  return deepFreeze({
    schema: DIRECTOR_SCHEMA,
    participantOrder: rows.map((row) => row.participantId),
    stateByParticipant,
    presentationOnly: true,
    gameplayAuthority: false,
    positionAuthority: 'EXTERNAL_PARENT_BOARD_MARKER',
  });
}

export function applyFourParticipantControlledCharacterEvent(state, participantId, event = {}) {
  if (!validDirectorState(state)) throw new TypeError('FOUR_PARTICIPANT_DIRECTOR_STATE_REQUIRED');
  if (!nonEmptyString(participantId) || !state.stateByParticipant[participantId]) {
    return deepFreeze({ state, accepted: false, reason: 'UNKNOWN_PARTICIPANT' });
  }

  const current = state.stateByParticipant[participantId];
  const nextParticipantState = transitionControlledCharacterMotion(current, event);
  const nextMap = copyStateMap(state);
  nextMap[participantId] = nextParticipantState;
  const nextState = deepFreeze({ ...state, stateByParticipant: nextMap });

  return deepFreeze({
    state: nextState,
    accepted: nextParticipantState.lastTransition.accepted === true,
    reason: nextParticipantState.lastTransition.reason,
    participantId,
    characterId: current.characterId,
    motionSerial: nextParticipantState.motionSerial,
  });
}

export function reconcileFourParticipantControlledCharacters(state, { participants } = {}) {
  if (!validDirectorState(state)) throw new TypeError('FOUR_PARTICIPANT_DIRECTOR_STATE_REQUIRED');
  const rows = normalizeInitialParticipants(participants);
  const incomingIds = rows.map((row) => row.participantId);
  if (incomingIds.length !== state.participantOrder.length
      || incomingIds.some((id) => !state.stateByParticipant[id])) {
    return deepFreeze({ state, accepted: false, reason: 'PARTICIPANT_SET_CHANGED' });
  }

  const nextMap = copyStateMap(state);
  for (const row of rows) {
    const current = state.stateByParticipant[row.participantId];
    if (row.characterId !== current.characterId) {
      return deepFreeze({ state, accepted: false, reason: 'CHARACTER_IDENTITY_CHANGED' });
    }
    nextMap[row.participantId] = transitionControlledCharacterMotion(current, {
      type: 'RECONNECT',
      revision: row.revision,
      controlGeneration: row.controlGeneration,
      positionKey: row.positionKey,
    });
  }

  return deepFreeze({
    state: deepFreeze({ ...state, stateByParticipant: nextMap }),
    accepted: true,
    reason: 'AUTHORITATIVE_RECONCILE_PROJECTED',
  });
}

export function projectFourParticipantControlledCharacterMotion(state, {
  reducedMotion = false,
  lowPerformance = false,
  visualAvailableByParticipant = {},
} = {}) {
  if (!validDirectorState(state)) throw new TypeError('FOUR_PARTICIPANT_DIRECTOR_STATE_REQUIRED');

  return deepFreeze(state.participantOrder.map((participantId) => {
    const participantState = state.stateByParticipant[participantId];
    const visualAvailable = Object.hasOwn(visualAvailableByParticipant, participantId)
      ? visualAvailableByParticipant[participantId] !== false
      : true;
    return {
      participantId,
      characterId: participantState.characterId,
      positionKey: participantState.positionKey,
      motion: projectControlledCharacterMotion(participantState, {
        reducedMotion,
        lowPerformance,
        visualAvailable,
      }),
    };
  }));
}

export const FOUR_PARTICIPANT_CONTROLLED_CHARACTER_MOTION_CONTRACT = Object.freeze({
  schema: DIRECTOR_SCHEMA,
  participantCount: PARTICIPANT_COUNT,
  presentationOnly: true,
  gameplayAuthority: false,
  positionAuthority: 'EXTERNAL_PARENT_BOARD_MARKER',
  identityAuthority: 'CALLER_SUPPLIED_OPAQUE_CHARACTER_ID',
  eventAuthority: 'EXISTING_CONTROLLED_CHARACTER_MOTION_CORE',
  samePositionPolicy: 'PRESERVE_EVERY_PARTICIPANT',
  advicePartnerCoupling: false,
  liveBindingIncluded: false,
});
