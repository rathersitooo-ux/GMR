const STREAM_EVENT_SCHEMA = 'gr.partner.stream-event.v1';
const PROTOTYPE_DATA_CLASS = 'prototype_local';
const TARGET_PLAN_SCHEMA = 'gr.partner.interaction-plan.v1';
const PUBLIC_STREAM_MODE = 'public_stream';
const FORMAL_PERSONA_AUTHORITY = 'formal_persona_required';
const TRANSPORT_STATE_SCHEMA = 'gr.partner.public-transport-state.v1';
const TRANSPORT_AUTHORITY = 'caller_supplied';

const DEFAULT_MAX_QUEUE = 64;
const DEFAULT_MAX_SEEN = 256;
const DEFAULT_RETRY_BASE_MS = 500;
const DEFAULT_RETRY_MAX_MS = 8000;
const SENSITIVE_FIELD_NAME = /(authorization|cookie|token|secret|api.?key|password|client.?secret)/i;

const SUPPORT_SOURCE_TYPES = new Set(['superChatEvent', 'superStickerEvent', 'giftEvent']);
const MEMBERSHIP_SOURCE_TYPES = new Set([
  'newSponsorEvent',
  'memberMilestoneChatEvent',
  'membershipGiftingEvent',
  'giftMembershipReceivedEvent',
]);

function nonEmpty(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function nonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative safe integer`);
  return value;
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive safe integer`);
  return value;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function validateStreamEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) throw new Error('streamEvent must be an object');
  if (event.schema !== STREAM_EVENT_SCHEMA) throw new Error('unsupported stream event schema');
  if (event.dataClass !== PROTOTYPE_DATA_CLASS) throw new Error('unsupported stream event dataClass');
  const sourceType = nonEmpty(event.sourceType, 'streamEvent.sourceType');
  const sourceMessageId = nonEmpty(event.sourceMessageId, 'streamEvent.sourceMessageId');
  if (event.speakCandidate !== undefined && typeof event.speakCandidate !== 'boolean') {
    throw new Error('streamEvent.speakCandidate must be boolean when present');
  }
  return {sourceType, sourceMessageId};
}

function classifyEvent(sourceType, speakCandidate) {
  if (speakCandidate === false) return 'unknown';
  if (sourceType === 'textMessageEvent') return 'chat';
  if (SUPPORT_SOURCE_TYPES.has(sourceType)) return 'super_chat';
  if (MEMBERSHIP_SOURCE_TYPES.has(sourceType)) return 'membership';
  return 'unknown';
}

function safeEventText(event) {
  const candidate = event.text ?? event.rawDisplayMessage ?? '';
  if (typeof candidate !== 'string') throw new Error('stream event text must be a string when present');
  return candidate;
}

function projectMemoryRef(memory) {
  return {
    id: memory.id,
    kind: typeof memory.kind === 'string' ? memory.kind : 'unknown',
    source: memory.source,
    visibility: 'public',
  };
}

function filterPublicMemoryRefs(memoryRefs) {
  if (!Array.isArray(memoryRefs)) throw new Error('memoryRefs must be an array');
  const allowedMemoryRefs = [];
  const forbiddenMemoryRefs = [];
  const seen = new Set();

  for (const memory of memoryRefs) {
    if (!memory || typeof memory !== 'object' || Array.isArray(memory)) throw new Error('memoryRefs entries must be objects');
    const id = nonEmpty(memory.id, 'memory.id');
    if (seen.has(id)) throw new Error(`duplicate memory.id: ${id}`);
    seen.add(id);

    const publiclyUsable =
      memory.visibility === 'public' &&
      typeof memory.source === 'string' && memory.source.trim() !== '' &&
      memory.confidence === 'verified' &&
      memory.status === 'active';

    if (!publiclyUsable) {
      forbiddenMemoryRefs.push(id);
      continue;
    }

    allowedMemoryRefs.push(projectMemoryRef({...memory, source: memory.source.trim()}));
  }

  return {allowedMemoryRefs, forbiddenMemoryRefs};
}

export function preparePublicStreamInteractionContext({streamEvent, memoryRefs = []} = {}) {
  const {sourceType, sourceMessageId} = validateStreamEvent(streamEvent);
  const {allowedMemoryRefs, forbiddenMemoryRefs} = filterPublicMemoryRefs(memoryRefs);
  const eventType = classifyEvent(sourceType, streamEvent.speakCandidate);

  return deepFreeze({
    targetPlanSchema: TARGET_PLAN_SCHEMA,
    dataClass: PROTOTYPE_DATA_CLASS,
    audienceMode: PUBLIC_STREAM_MODE,
    event: {
      type: eventType,
      text: safeEventText(streamEvent),
      sourceId: sourceMessageId,
      confidence: 'verified',
    },
    allowedMemoryRefs,
    forbiddenMemoryRefs,
    monetizationHandling: {
      commerceIsRelationshipScore: false,
      amountChangesIntimacy: false,
      spenderGetsPrivatePrivilege: false,
    },
    relationshipDelta: {},
    formalPersonaAuthority: FORMAL_PERSONA_AUTHORITY,
    automaticGameChange: false,
    automaticPublish: false,
  });
}

function normalizeCursor(cursor, label = 'cursor') {
  if (cursor === null || cursor === undefined) return null;
  return nonEmpty(cursor, label);
}

function validateBoolean(value, label) {
  if (typeof value !== 'boolean') throw new Error(`${label} must be boolean`);
  return value;
}

function countSensitiveFieldNames(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object') return 0;
  if (seen.has(value)) return 0;
  seen.add(value);
  let count = 0;
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_FIELD_NAME.test(key)) count += 1;
    count += countSensitiveFieldNames(child, seen);
  }
  return count;
}

function transportPayloadFromContext(context) {
  return deepFreeze({
    targetPlanSchema: context.targetPlanSchema,
    dataClass: context.dataClass,
    audienceMode: context.audienceMode,
    event: {
      type: context.event.type,
      text: context.event.text,
      sourceId: context.event.sourceId,
      confidence: context.event.confidence,
    },
    allowedMemoryRefs: context.allowedMemoryRefs.map((memory) => ({...memory})),
    monetizationHandling: {...context.monetizationHandling},
    relationshipDelta: {},
    formalPersonaAuthority: context.formalPersonaAuthority,
    automaticGameChange: false,
    automaticPublish: false,
  });
}

function assertTransportState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state) || state.schema !== TRANSPORT_STATE_SCHEMA) {
    throw new Error('transport state schema mismatch');
  }
  nonEmpty(state.sessionId, 'transportState.sessionId');
  validateBoolean(state.connected, 'transportState.connected');
  validateBoolean(state.authenticated, 'transportState.authenticated');
  if (state.authenticationAuthority !== TRANSPORT_AUTHORITY) throw new Error('transport authentication authority mismatch');
  normalizeCursor(state.cursor, 'transportState.cursor');
  if (!Number.isSafeInteger(state.lastSequence) || state.lastSequence < -1) throw new Error('transportState.lastSequence invalid');
  if (!Array.isArray(state.seenDeliveryIds) || state.seenDeliveryIds.some((id) => typeof id !== 'string' || id === '')) {
    throw new Error('transportState.seenDeliveryIds invalid');
  }
  if (!Array.isArray(state.queue)) throw new Error('transportState.queue invalid');
  positiveInteger(state.maxQueue, 'transportState.maxQueue');
  positiveInteger(state.maxSeen, 'transportState.maxSeen');
  nonNegativeInteger(state.retryAttempt, 'transportState.retryAttempt');
  positiveInteger(state.retryBaseMs, 'transportState.retryBaseMs');
  positiveInteger(state.retryMaxMs, 'transportState.retryMaxMs');
  if (state.retryMaxMs < state.retryBaseMs) throw new Error('transportState.retryMaxMs must be >= retryBaseMs');
  return state;
}

function buildTransportState(state, overrides = {}) {
  return deepFreeze({
    schema: TRANSPORT_STATE_SCHEMA,
    sessionId: overrides.sessionId ?? state.sessionId,
    connected: overrides.connected ?? state.connected,
    authenticated: overrides.authenticated ?? state.authenticated,
    authenticationAuthority: TRANSPORT_AUTHORITY,
    cursor: Object.prototype.hasOwnProperty.call(overrides, 'cursor') ? overrides.cursor : state.cursor,
    lastSequence: overrides.lastSequence ?? state.lastSequence,
    seenDeliveryIds: overrides.seenDeliveryIds ?? [...state.seenDeliveryIds],
    queue: overrides.queue ?? [...state.queue],
    maxQueue: state.maxQueue,
    maxSeen: state.maxSeen,
    retryAttempt: overrides.retryAttempt ?? state.retryAttempt,
    retryBaseMs: state.retryBaseMs,
    retryMaxMs: state.retryMaxMs,
  });
}

function transportDecision(status, reason, state, extra = {}) {
  return deepFreeze({
    schema: TRANSPORT_STATE_SCHEMA,
    status,
    reason,
    state,
    ...extra,
  });
}

function retryDelayMs(state, attempt = state.retryAttempt) {
  const exponent = Math.max(0, Math.min(20, attempt - 1));
  return Math.min(state.retryMaxMs, state.retryBaseMs * (2 ** exponent));
}

function transportFailure(state, reason) {
  const nextAttempt = Math.min(31, state.retryAttempt + 1);
  const nextState = buildTransportState(state, {retryAttempt: nextAttempt});
  return transportDecision('failed', reason, nextState, {retryDelayMs: retryDelayMs(nextState)});
}

export function createPublicStreamTransportState({
  sessionId,
  connected = false,
  authenticated = false,
  cursor = null,
  maxQueue = DEFAULT_MAX_QUEUE,
  maxSeen = DEFAULT_MAX_SEEN,
  retryBaseMs = DEFAULT_RETRY_BASE_MS,
  retryMaxMs = DEFAULT_RETRY_MAX_MS,
} = {}) {
  const normalizedSessionId = nonEmpty(sessionId, 'sessionId');
  validateBoolean(connected, 'connected');
  validateBoolean(authenticated, 'authenticated');
  const normalizedCursor = normalizeCursor(cursor);
  positiveInteger(maxQueue, 'maxQueue');
  positiveInteger(maxSeen, 'maxSeen');
  positiveInteger(retryBaseMs, 'retryBaseMs');
  positiveInteger(retryMaxMs, 'retryMaxMs');
  if (retryMaxMs < retryBaseMs) throw new Error('retryMaxMs must be >= retryBaseMs');

  return deepFreeze({
    schema: TRANSPORT_STATE_SCHEMA,
    sessionId: normalizedSessionId,
    connected,
    authenticated,
    authenticationAuthority: TRANSPORT_AUTHORITY,
    cursor: normalizedCursor,
    lastSequence: -1,
    seenDeliveryIds: [],
    queue: [],
    maxQueue,
    maxSeen,
    retryAttempt: 0,
    retryBaseMs,
    retryMaxMs,
  });
}

export function updatePublicStreamTransportConnection(state, {
  connected,
  authenticated,
  cursor,
} = {}) {
  assertTransportState(state);
  const nextConnected = connected === undefined ? state.connected : validateBoolean(connected, 'connected');
  const nextAuthenticated = authenticated === undefined ? state.authenticated : validateBoolean(authenticated, 'authenticated');
  const hasCursor = cursor !== undefined;
  const normalizedCursor = hasCursor ? normalizeCursor(cursor) : state.cursor;
  return buildTransportState(state, {
    connected: nextConnected,
    authenticated: nextAuthenticated,
    cursor: normalizedCursor,
  });
}

export function receivePublicStreamTransportEvent({state, envelope, memoryRefs = []} = {}) {
  assertTransportState(state);
  if (!state.connected) return transportDecision('blocked', 'TRANSPORT_DISCONNECTED', state);
  if (!state.authenticated) return transportDecision('blocked', 'TRANSPORT_UNAUTHENTICATED', state);
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    return transportDecision('rejected', 'TRANSPORT_ENVELOPE_INVALID', state);
  }

  let sessionId;
  let deliveryId;
  let sequence;
  let cursor;
  try {
    sessionId = nonEmpty(envelope.sessionId, 'envelope.sessionId');
    deliveryId = nonEmpty(envelope.deliveryId, 'envelope.deliveryId');
    sequence = nonNegativeInteger(envelope.sequence, 'envelope.sequence');
    cursor = normalizeCursor(envelope.cursor, 'envelope.cursor');
  } catch {
    return transportDecision('rejected', 'TRANSPORT_ENVELOPE_INVALID', state);
  }

  if (sessionId !== state.sessionId) return transportDecision('rejected', 'TRANSPORT_SESSION_MISMATCH', state);
  if (state.seenDeliveryIds.includes(deliveryId)) return transportDecision('duplicate', 'TRANSPORT_DUPLICATE', state);
  if (sequence <= state.lastSequence) return transportDecision('rejected', 'TRANSPORT_LATE_OR_OUT_OF_ORDER', state);
  if (state.queue.length >= state.maxQueue) return transportDecision('blocked', 'TRANSPORT_QUEUE_FULL', state);

  let context;
  try {
    context = preparePublicStreamInteractionContext({streamEvent: envelope.streamEvent, memoryRefs});
  } catch {
    return transportDecision('rejected', 'PUBLIC_CONTEXT_REJECTED', state);
  }

  const payload = transportPayloadFromContext(context);
  const nextSeen = [...state.seenDeliveryIds, deliveryId].slice(-state.maxSeen);
  const entry = deepFreeze({deliveryId, sequence, cursor, payload});
  const nextState = buildTransportState(state, {
    cursor: cursor ?? state.cursor,
    lastSequence: sequence,
    seenDeliveryIds: nextSeen,
    queue: [...state.queue, entry],
    retryAttempt: 0,
  });
  const redactedSensitiveFieldCount = countSensitiveFieldNames(envelope) + countSensitiveFieldNames(memoryRefs);
  return transportDecision('accepted', 'PUBLIC_EVENT_QUEUED', nextState, {
    payload,
    redactedSensitiveFieldCount,
  });
}

export async function pollPublicStreamTransportEvent({state, receive, memoryRefs = []} = {}) {
  assertTransportState(state);
  if (!state.connected) return transportDecision('blocked', 'TRANSPORT_DISCONNECTED', state);
  if (!state.authenticated) return transportDecision('blocked', 'TRANSPORT_UNAUTHENTICATED', state);
  if (typeof receive !== 'function') return transportFailure(state, 'TRANSPORT_RECEIVE_UNAVAILABLE');

  let envelope;
  try {
    envelope = await receive(deepFreeze({sessionId: state.sessionId, cursor: state.cursor}));
  } catch {
    return transportFailure(state, 'TRANSPORT_RECEIVE_FAILED');
  }
  if (envelope === null || envelope === undefined) {
    return transportDecision('idle', 'TRANSPORT_NO_EVENT', buildTransportState(state, {retryAttempt: 0}));
  }
  return receivePublicStreamTransportEvent({state, envelope, memoryRefs});
}

export async function flushPublicStreamTransportQueue({state, send} = {}) {
  assertTransportState(state);
  if (!state.connected) return transportDecision('blocked', 'TRANSPORT_DISCONNECTED', state);
  if (!state.authenticated) return transportDecision('blocked', 'TRANSPORT_UNAUTHENTICATED', state);
  if (state.queue.length === 0) return transportDecision('idle', 'TRANSPORT_QUEUE_EMPTY', buildTransportState(state, {retryAttempt: 0}));
  if (typeof send !== 'function') return transportFailure(state, 'TRANSPORT_SEND_UNAVAILABLE');

  const entry = state.queue[0];
  try {
    const outcome = await send(entry.payload, deepFreeze({
      sessionId: state.sessionId,
      deliveryId: entry.deliveryId,
      sequence: entry.sequence,
      cursor: entry.cursor,
    }));
    if (outcome === false || (outcome && typeof outcome === 'object' && outcome.ok === false)) {
      return transportFailure(state, 'TRANSPORT_SEND_FAILED');
    }
  } catch {
    return transportFailure(state, 'TRANSPORT_SEND_FAILED');
  }

  const nextState = buildTransportState(state, {
    queue: state.queue.slice(1),
    retryAttempt: 0,
  });
  return transportDecision('sent', 'TRANSPORT_SEND_OK', nextState, {
    deliveryId: entry.deliveryId,
    sequence: entry.sequence,
  });
}

export const PARTNER_VTUBER_PUBLIC_CONTEXT_CONTRACT = Object.freeze({
  streamEventSchema: STREAM_EVENT_SCHEMA,
  dataClass: PROTOTYPE_DATA_CLASS,
  targetPlanSchema: TARGET_PLAN_SCHEMA,
  audienceMode: PUBLIC_STREAM_MODE,
  formalPersonaAuthority: FORMAL_PERSONA_AUTHORITY,
});

export const PARTNER_VTUBER_NONSECRET_TRANSPORT_CONTRACT = Object.freeze({
  stateSchema: TRANSPORT_STATE_SCHEMA,
  authenticationAuthority: TRANSPORT_AUTHORITY,
  defaultMaxQueue: DEFAULT_MAX_QUEUE,
  defaultMaxSeen: DEFAULT_MAX_SEEN,
  defaultRetryBaseMs: DEFAULT_RETRY_BASE_MS,
  defaultRetryMaxMs: DEFAULT_RETRY_MAX_MS,
  ownsCredentialValues: false,
  ownsOAuth: false,
  ownsFormalPersona: false,
  automaticPublish: false,
  automaticGameChange: false,
});
