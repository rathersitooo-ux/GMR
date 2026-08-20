const REQUEST_SCHEMA = 'GAMEROAD_REPLAY_PUBLIC_COMMENTARY_REQUEST_V1';
const CANDIDATE_SCHEMA = 'GAMEROAD_REPLAY_PUBLIC_SPEECH_CANDIDATE_V1';
const ARBITER_SCHEMA = 'GAMEROAD_REPLAY_PUBLIC_SPEECH_ARBITER_V1';
const DISPATCH_SCHEMA = 'GAMEROAD_REPLAY_PUBLIC_SPEECH_DISPATCH_V1';
const ALLOWED_SPEAKER_CLASSES = new Set(['PUBLIC_MC', 'PUBLIC_GUEST']);
const SETTLE_OUTCOMES = new Set(['COMPLETED', 'DROP', 'RETRY']);

function own(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function nonEmptyString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${field}_INVALID`);
  return value.trim();
}

function finiteNumber(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${field}_INVALID`);
  return value;
}

function clonePublicJson(value, path = 'public') {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${path}_NON_JSON_NUMBER`);
    return value;
  }
  if (Array.isArray(value)) return value.map((item, index) => clonePublicJson(item, `${path}[${index}]`));
  if (!isPlainObject(value)) throw new TypeError(`${path}_NON_JSON_VALUE`);

  const out = {};
  for (const [key, child] of Object.entries(value)) {
    const lower = key.toLowerCase();
    if (lower.includes('private') || lower.includes('secret') || lower === 'authorityonly') {
      throw new TypeError(`PUBLIC_PROJECTION_FORBIDDEN_KEY:${path}.${key}`);
    }
    out[key] = clonePublicJson(child, `${path}.${key}`);
  }
  return out;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function stableCandidate(candidate) {
  return JSON.stringify(candidate);
}

function validateDirectorProjection(decision) {
  if (!isPlainObject(decision) || decision.presentationOnly !== true) {
    throw new TypeError('DIRECTOR_PROJECTION_INVALID');
  }
  if (!Number.isSafeInteger(decision.decisionSerial) || decision.decisionSerial < 1) {
    throw new TypeError('DIRECTOR_DECISION_SERIAL_INVALID');
  }
  const selectedEventId = nonEmptyString(decision.selectedEventId, 'DIRECTOR_SELECTED_EVENT_ID');
  if (own(decision, 'publicData') || own(decision, 'privateData') || own(decision, 'privateByViewer') || own(decision, 'authorityOnly')) {
    throw new TypeError('DIRECTOR_PROJECTION_NOT_IDENTITY_ONLY');
  }
  return {
    decisionSerial: decision.decisionSerial,
    selectedEventId,
    selectedCandidateId: decision.selectedCandidateId == null
      ? null
      : nonEmptyString(decision.selectedCandidateId, 'DIRECTOR_SELECTED_CANDIDATE_ID'),
  };
}

function validateRequest(request) {
  if (!isPlainObject(request) || request.schema !== REQUEST_SCHEMA || request.presentationOnly !== true) {
    throw new TypeError('COMMENTARY_REQUEST_INVALID');
  }
  nonEmptyString(request.requestId, 'REQUEST_ID');
  nonEmptyString(request.selectedEventId, 'REQUEST_SELECTED_EVENT_ID');
  if (!Number.isSafeInteger(request.decisionSerial) || request.decisionSerial < 1) {
    throw new TypeError('REQUEST_DECISION_SERIAL_INVALID');
  }
  if (!ALLOWED_SPEAKER_CLASSES.has(request.speakerClass)) throw new TypeError('REQUEST_SPEAKER_CLASS_INVALID');
  clonePublicJson(request.publicEvent, 'request.publicEvent');
  return request;
}

function validateCandidate(candidate) {
  if (!isPlainObject(candidate) || candidate.schema !== CANDIDATE_SCHEMA || candidate.presentationOnly !== true) {
    throw new TypeError('SPEECH_CANDIDATE_INVALID');
  }
  nonEmptyString(candidate.candidateId, 'CANDIDATE_ID');
  nonEmptyString(candidate.requestId, 'CANDIDATE_REQUEST_ID');
  nonEmptyString(candidate.selectedEventId, 'CANDIDATE_SELECTED_EVENT_ID');
  nonEmptyString(candidate.text, 'CANDIDATE_TEXT');
  finiteNumber(candidate.priority, 'CANDIDATE_PRIORITY');
  if (!Number.isSafeInteger(candidate.decisionSerial) || candidate.decisionSerial < 1) {
    throw new TypeError('CANDIDATE_DECISION_SERIAL_INVALID');
  }
  if (!ALLOWED_SPEAKER_CLASSES.has(candidate.speakerClass)) throw new TypeError('CANDIDATE_SPEAKER_CLASS_INVALID');
  return candidate;
}

function validateArbiter(state) {
  if (!isPlainObject(state) || state.schema !== ARBITER_SCHEMA) throw new TypeError('ARBITER_STATE_INVALID');
  if (!Number.isSafeInteger(state.maxPending) || state.maxPending < 1) throw new TypeError('ARBITER_MAX_PENDING_INVALID');
  if (!Array.isArray(state.pending) || !Array.isArray(state.knownCandidates) || !Array.isArray(state.settledDispatchIds)) {
    throw new TypeError('ARBITER_COLLECTION_INVALID');
  }
  if (state.inFlight !== null && !isPlainObject(state.inFlight)) throw new TypeError('ARBITER_INFLIGHT_INVALID');
  return state;
}

export function createPublicCommentaryGenerationRequest({
  requestId,
  directorDecision,
  selectedEvent,
  speakerClass,
} = {}) {
  const identity = validateDirectorProjection(directorDecision);
  if (!ALLOWED_SPEAKER_CLASSES.has(speakerClass)) throw new TypeError('SPEAKER_CLASS_NOT_PUBLIC');
  if (!isPlainObject(selectedEvent)) throw new TypeError('SELECTED_PUBLIC_EVENT_INVALID');
  const selectedEventId = nonEmptyString(selectedEvent.eventId, 'SELECTED_PUBLIC_EVENT_ID');
  if (selectedEventId !== identity.selectedEventId) throw new TypeError('DIRECTOR_EVENT_MISMATCH');

  const publicEvent = clonePublicJson(selectedEvent, 'selectedEvent');
  return deepFreeze({
    schema: REQUEST_SCHEMA,
    requestId: nonEmptyString(requestId, 'REQUEST_ID'),
    presentationOnly: true,
    eventSelectionAuthority: 'BATTLE_REPLAY_DIRECTOR_DECISION',
    decisionSerial: identity.decisionSerial,
    selectedCandidateId: identity.selectedCandidateId,
    selectedEventId,
    speakerClass,
    publicEvent,
    generationInstruction: 'GENERATE_PUBLIC_COMMENTARY_FROM_THIS_PUBLIC_EVENT_ONLY',
    personaApprovalClaimed: false,
    automaticPublishAllowed: false,
    automaticGameMutationAllowed: false,
  });
}

export function createPublicSpeechCandidate({ candidateId, request, text, priority } = {}) {
  validateRequest(request);
  return deepFreeze({
    schema: CANDIDATE_SCHEMA,
    candidateId: nonEmptyString(candidateId, 'CANDIDATE_ID'),
    presentationOnly: true,
    requestId: request.requestId,
    decisionSerial: request.decisionSerial,
    selectedEventId: request.selectedEventId,
    speakerClass: request.speakerClass,
    text: nonEmptyString(text, 'CANDIDATE_TEXT'),
    priority: finiteNumber(priority, 'CANDIDATE_PRIORITY'),
    personaApprovalClaimed: false,
    automaticPublishAllowed: false,
    automaticGameMutationAllowed: false,
  });
}

export function createPublicSpeechArbiterState({ maxPending } = {}) {
  if (!Number.isSafeInteger(maxPending) || maxPending < 1) throw new TypeError('ARBITER_MAX_PENDING_INVALID');
  return deepFreeze({
    schema: ARBITER_SCHEMA,
    maxPending,
    pending: [],
    inFlight: null,
    knownCandidates: [],
    settledDispatchIds: [],
    automaticDispatchAllowed: false,
    automaticRetryAllowed: false,
  });
}

export function offerPublicSpeechCandidate(state, rawCandidate) {
  validateArbiter(state);
  const candidate = validateCandidate(rawCandidate);
  const known = state.knownCandidates.find((item) => item.candidateId === candidate.candidateId);
  if (known) {
    if (stableCandidate(known) !== stableCandidate(candidate)) throw new TypeError('CANDIDATE_ID_CONFLICT');
    return state;
  }
  if (state.pending.length >= state.maxPending) throw new TypeError('SPEECH_QUEUE_FULL');

  const pending = [...state.pending, candidate].sort((left, right) => {
    if (right.priority !== left.priority) return right.priority - left.priority;
    if (left.decisionSerial !== right.decisionSerial) return left.decisionSerial - right.decisionSerial;
    return left.candidateId.localeCompare(right.candidateId);
  });
  return deepFreeze({
    ...state,
    pending,
    knownCandidates: [...state.knownCandidates, candidate],
  });
}

export function dispatchNextPublicSpeech(state, { channelIdle, dispatchId } = {}) {
  validateArbiter(state);
  if (channelIdle !== true) return deepFreeze({ state, dispatch: null });
  if (state.inFlight !== null || state.pending.length === 0) return deepFreeze({ state, dispatch: null });

  const normalizedDispatchId = nonEmptyString(dispatchId, 'DISPATCH_ID');
  if (state.settledDispatchIds.includes(normalizedDispatchId)) throw new TypeError('DISPATCH_ID_ALREADY_SETTLED');

  const [candidate, ...pending] = state.pending;
  const dispatch = deepFreeze({
    schema: DISPATCH_SCHEMA,
    dispatchId: normalizedDispatchId,
    candidateId: candidate.candidateId,
    requestId: candidate.requestId,
    decisionSerial: candidate.decisionSerial,
    selectedEventId: candidate.selectedEventId,
    speakerClass: candidate.speakerClass,
    text: candidate.text,
    presentationOnly: true,
    automaticPublishAllowed: false,
    automaticGameMutationAllowed: false,
  });
  const nextState = deepFreeze({ ...state, pending, inFlight: dispatch });
  return deepFreeze({ state: nextState, dispatch });
}

export function settlePublicSpeechDispatch(state, { dispatchId, outcome } = {}) {
  validateArbiter(state);
  const normalizedDispatchId = nonEmptyString(dispatchId, 'DISPATCH_ID');
  if (!SETTLE_OUTCOMES.has(outcome)) throw new TypeError('DISPATCH_OUTCOME_INVALID');
  if (!state.inFlight || state.inFlight.dispatchId !== normalizedDispatchId) {
    throw new TypeError('DISPATCH_NOT_IN_FLIGHT');
  }

  const candidate = state.knownCandidates.find((item) => item.candidateId === state.inFlight.candidateId);
  if (!candidate) throw new TypeError('DISPATCH_CANDIDATE_MISSING');

  const pending = outcome === 'RETRY'
    ? [...state.pending, candidate].sort((left, right) => {
        if (right.priority !== left.priority) return right.priority - left.priority;
        if (left.decisionSerial !== right.decisionSerial) return left.decisionSerial - right.decisionSerial;
        return left.candidateId.localeCompare(right.candidateId);
      })
    : state.pending;

  return deepFreeze({
    ...state,
    pending,
    inFlight: null,
    settledDispatchIds: [...state.settledDispatchIds, normalizedDispatchId],
  });
}

export const BATTLE_REPLAY_PUBLIC_COMMENTARY_CONTRACT = deepFreeze({
  requestSchema: REQUEST_SCHEMA,
  candidateSchema: CANDIDATE_SCHEMA,
  arbiterSchema: ARBITER_SCHEMA,
  dispatchSchema: DISPATCH_SCHEMA,
  allowedSpeakerClasses: [...ALLOWED_SPEAKER_CLASSES],
  eventSelectionAuthority: 'BATTLE_REPLAY_DIRECTOR_DECISION',
  gameStateAuthority: 'NONE',
  storageAuthority: 'NONE',
  privateDataAllowed: false,
  personalPartnerPrivateMemoryAllowed: false,
  personaApprovalClaimed: false,
  oauthHandled: false,
  ttsHandled: false,
  avatarHandled: false,
  automaticPublishAllowed: false,
  automaticGameMutationAllowed: false,
  automaticRetryAllowed: false,
});
