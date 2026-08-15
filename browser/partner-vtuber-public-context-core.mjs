const STREAM_EVENT_SCHEMA = 'gr.partner.stream-event.v1';
const PROTOTYPE_DATA_CLASS = 'prototype_local';
const TARGET_PLAN_SCHEMA = 'gr.partner.interaction-plan.v1';
const PUBLIC_STREAM_MODE = 'public_stream';
const FORMAL_PERSONA_AUTHORITY = 'formal_persona_required';

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

export const PARTNER_VTUBER_PUBLIC_CONTEXT_CONTRACT = Object.freeze({
  streamEventSchema: STREAM_EVENT_SCHEMA,
  dataClass: PROTOTYPE_DATA_CLASS,
  targetPlanSchema: TARGET_PLAN_SCHEMA,
  audienceMode: PUBLIC_STREAM_MODE,
  formalPersonaAuthority: FORMAL_PERSONA_AUTHORITY,
});
