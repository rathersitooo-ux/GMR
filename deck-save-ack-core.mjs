const SCHEMA = 'gameroad.deck-save-ack.v1';
const MATCH_START_SCHEMA = 'gameroad.browser.match-start-snapshot.v1';

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function requireNonEmptyString(value, label) {
  if (!nonEmptyString(value)) throw new TypeError(`${label.toUpperCase()}_REQUIRED`);
  return value;
}

function normalizeRevision(value, label = 'revision') {
  const validString = nonEmptyString(value);
  const validInteger = Number.isSafeInteger(value) && value >= 0;
  if (!validString && !validInteger) {
    throw new TypeError(`${label.toUpperCase()}_REQUIRED`);
  }
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function freezeState(raw) {
  return deepFreeze({
    ...raw,
    seenRequestIds: [...raw.seenRequestIds],
    pending: raw.pending ? { ...raw.pending } : null,
    lastAccepted: raw.lastAccepted ? { ...raw.lastAccepted } : null,
  });
}

function assertState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new TypeError('STATE_REQUIRED');
  }
  if (state.schema !== SCHEMA) throw new TypeError('STATE_SCHEMA_UNSUPPORTED');
  requireNonEmptyString(state.deckId, 'deckId');
  requireNonEmptyString(state.baselineSignature, 'baselineSignature');
  requireNonEmptyString(state.currentSignature, 'currentSignature');
  if (!Number.isSafeInteger(state.editGeneration) || state.editGeneration < 0) {
    throw new TypeError('EDIT_GENERATION_INVALID');
  }
  if (typeof state.dirty !== 'boolean') throw new TypeError('DIRTY_INVALID');
  if (!Array.isArray(state.seenRequestIds) ||
      state.seenRequestIds.some(id => !nonEmptyString(id)) ||
      new Set(state.seenRequestIds).size !== state.seenRequestIds.length) {
    throw new TypeError('SEEN_REQUEST_IDS_INVALID');
  }
  if (state.pending) {
    requireNonEmptyString(state.pending.requestId, 'requestId');
    if (state.pending.deckId !== state.deckId) throw new TypeError('PENDING_DECK_MISMATCH');
    requireNonEmptyString(state.pending.signature, 'signature');
    normalizeRevision(state.pending.expectedRevision, 'expectedRevision');
    if (!Number.isSafeInteger(state.pending.editGeneration) || state.pending.editGeneration < 0) {
      throw new TypeError('PENDING_EDIT_GENERATION_INVALID');
    }
    if (!state.seenRequestIds.includes(state.pending.requestId)) {
      throw new TypeError('PENDING_REQUEST_NOT_SEEN');
    }
  }
  if (state.lastAccepted) {
    requireNonEmptyString(state.lastAccepted.requestId, 'requestId');
    if (state.lastAccepted.deckId !== state.deckId) throw new TypeError('ACCEPTED_DECK_MISMATCH');
    requireNonEmptyString(state.lastAccepted.signature, 'signature');
    normalizeRevision(state.lastAccepted.revision);
    if (!state.seenRequestIds.includes(state.lastAccepted.requestId)) {
      throw new TypeError('ACCEPTED_REQUEST_NOT_SEEN');
    }
  }
  return state;
}

function decision(state, status, reason) {
  return deepFreeze({ state, status, reason });
}

function exactIdentity(left, right) {
  return left.requestId === right.requestId &&
    left.deckId === right.deckId &&
    left.signature === right.signature &&
    Object.is(left.revision, right.revision);
}

export function createDeckSaveAckState({ deckId, baselineSignature } = {}) {
  requireNonEmptyString(deckId, 'deckId');
  requireNonEmptyString(baselineSignature, 'baselineSignature');
  return freezeState(assertState({
    schema: SCHEMA,
    deckId,
    baselineSignature,
    currentSignature: baselineSignature,
    editGeneration: 0,
    dirty: false,
    seenRequestIds: [],
    pending: null,
    lastAccepted: null,
  }));
}

export function applyDeckEdit(state, { signature } = {}) {
  assertState(state);
  requireNonEmptyString(signature, 'signature');
  if (signature === state.currentSignature) return state;
  return freezeState(assertState({
    ...state,
    currentSignature: signature,
    editGeneration: state.editGeneration + 1,
    dirty: signature !== state.baselineSignature,
  }));
}

export function beginDeckSave(state, { requestId, expectedRevision } = {}) {
  assertState(state);
  requireNonEmptyString(requestId, 'requestId');
  normalizeRevision(expectedRevision, 'expectedRevision');
  if (state.pending) throw new Error('SAVE_ALREADY_PENDING');
  if (state.seenRequestIds.includes(requestId)) throw new Error('REQUEST_ID_REUSED');

  return freezeState(assertState({
    ...state,
    seenRequestIds: [...state.seenRequestIds, requestId],
    pending: {
      requestId,
      deckId: state.deckId,
      signature: state.currentSignature,
      editGeneration: state.editGeneration,
      expectedRevision,
    },
  }));
}

export function receiveDeckSaveAck(state, ack = {}) {
  assertState(state);

  const completeIdentity = nonEmptyString(ack.requestId) &&
    nonEmptyString(ack.deckId) &&
    nonEmptyString(ack.signature) &&
    (nonEmptyString(ack.revision) || (Number.isSafeInteger(ack.revision) && ack.revision >= 0));

  if (!state.pending) {
    if (ack.success === true && completeIdentity && state.lastAccepted &&
        exactIdentity(ack, state.lastAccepted)) {
      return decision(state, 'duplicate', 'ACK_ALREADY_ACCEPTED');
    }
    return decision(state, 'ignored', completeIdentity ? 'NO_PENDING_SAVE' : 'ACK_IDENTITY_INCOMPLETE');
  }

  if (!completeIdentity) return decision(state, 'ignored', 'ACK_IDENTITY_INCOMPLETE');

  const pending = state.pending;
  if (ack.requestId !== pending.requestId) return decision(state, 'ignored', 'REQUEST_ID_MISMATCH');
  if (ack.deckId !== pending.deckId) return decision(state, 'ignored', 'DECK_ID_MISMATCH');
  if (ack.signature !== pending.signature) return decision(state, 'ignored', 'SIGNATURE_MISMATCH');
  if (!Object.is(ack.revision, pending.expectedRevision)) {
    return decision(state, 'ignored', 'REVISION_MISMATCH');
  }

  if (ack.success !== true) {
    const next = freezeState(assertState({ ...state, pending: null, dirty: true }));
    return decision(next, 'failed', 'SAVE_REJECTED');
  }

  const editedAfterSend = state.editGeneration !== pending.editGeneration;
  const next = freezeState(assertState({
    ...state,
    baselineSignature: pending.signature,
    pending: null,
    lastAccepted: {
      requestId: pending.requestId,
      deckId: pending.deckId,
      signature: pending.signature,
      revision: ack.revision,
    },
    dirty: editedAfterSend || state.currentSignature !== pending.signature,
  }));
  return decision(next, 'accepted', 'SAVE_CONFIRMED');
}

export function timeoutDeckSave(state, { requestId } = {}) {
  assertState(state);
  requireNonEmptyString(requestId, 'requestId');
  if (!state.pending) return decision(state, 'ignored', 'NO_PENDING_SAVE');
  if (state.pending.requestId !== requestId) return decision(state, 'ignored', 'REQUEST_ID_MISMATCH');
  const next = freezeState(assertState({ ...state, pending: null, dirty: true }));
  return decision(next, 'timed_out', 'SAVE_TIMEOUT');
}

export function createDeckMatchStartSnapshot(selection, { validateDeck } = {}) {
  if (!selection || typeof selection !== 'object' || Array.isArray(selection)) {
    throw new TypeError('MATCH_START_SELECTION_REQUIRED');
  }
  if (typeof validateDeck !== 'function') {
    throw new TypeError('MATCH_START_VALIDATE_DECK_REQUIRED');
  }

  const savedDeck = selection.savedDeck && typeof selection.savedDeck === 'object'
    ? selection.savedDeck
    : {};
  const deck = {
    main: Array.isArray(savedDeck.main) ? [...savedDeck.main] : [],
    ex: Array.isArray(savedDeck.ex) ? [...savedDeck.ex] : [],
  };
  const validation = validateDeck(deck, { forBattle: true });
  if (!validation || validation.ok !== true) {
    const reason = validation?.reason ?? validation?.errors?.[0] ?? 'INVALID_DECK';
    throw new Error(`MATCH_START_DECK_INVALID:${reason}`);
  }

  requireNonEmptyString(selection.setupMode, 'match_start_setup_mode');
  requireNonEmptyString(selection.setupContent, 'match_start_setup_content');
  const rule = selection.savedDeckRule && typeof selection.savedDeckRule === 'object'
    ? selection.savedDeckRule
    : {};

  return deepFreeze({
    schema: MATCH_START_SCHEMA,
    deck: {
      main: deck.main,
      ex: deck.ex,
      ruleId: rule.id ?? null,
      ruleRevision: rule.revision ?? null,
    },
    setup: {
      mode: selection.setupMode,
      content: selection.setupContent,
    },
    selection: {
      playerCharacterId: selection.playerCharacterId ?? null,
      selectedPartnerId: selection.selectedPartnerId ?? null,
    },
  });
}

export const DECK_SAVE_ACK_CORE = Object.freeze({ schema: SCHEMA });
export const DECK_MATCH_START_SNAPSHOT = Object.freeze({ schema: MATCH_START_SCHEMA });
