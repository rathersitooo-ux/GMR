const SCHEMA_VERSION = 'gameroad.partner-response-plan.v1';
const PURPOSES = new Set(['conversation_utterance', 'advice_recommendation']);
const SOURCE_ORIGINS = new Set(['approved_source', 'provider_candidate', 'derived_projection']);

const INPUT_KEYS = new Set([
  'schemaVersion',
  'planId',
  'partnerId',
  'purpose',
  'scope',
  'source',
  'presentation',
  'evidence',
  'authority',
]);
const PLAN_KEYS = new Set(['ok', ...INPUT_KEYS]);
const SCOPE_KEYS = new Set([
  'useSite',
  'publicScope',
  'safeForRender',
  'containsPrivate',
  'containsRawUserText',
]);
const SOURCE_KEYS = new Set(['sourceId', 'sourceVersion', 'origin']);
const EVIDENCE_KEYS = new Set(['evidenceIds']);
const AUTHORITY_KEYS = new Set([
  'mode',
  'autoExecute',
  'automaticCanonMutationAllowed',
  'automaticRelationshipMutationAllowed',
  'automaticGameMutationAllowed',
  'automaticRewardMutationAllowed',
]);
const UTTERANCE_KEYS = new Set(['kind', 'text']);
const EMPHASIS_KEYS = new Set(['kind', 'candidateId', 'targetId', 'alternativeCandidateId']);

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.has(key));
}

function exactToken(value, max = 180) {
  if (typeof value !== 'string' || !value || value.length > max || value.trim() !== value) return null;
  return value;
}

function boundedText(value, max = 800) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > max) return null;
  return text;
}

function parseEvidence(value) {
  if (!plainObject(value) || !hasOnlyKeys(value, EVIDENCE_KEYS)) return null;
  if (!Array.isArray(value.evidenceIds) || value.evidenceIds.length > 16) return null;
  const evidenceIds = [];
  const seen = new Set();
  for (const raw of value.evidenceIds) {
    const evidenceId = exactToken(raw);
    if (!evidenceId || seen.has(evidenceId)) return null;
    seen.add(evidenceId);
    evidenceIds.push(evidenceId);
  }
  return { evidenceIds };
}

function parseScope(value) {
  if (!plainObject(value) || !hasOnlyKeys(value, SCOPE_KEYS)) return null;
  const useSite = exactToken(value.useSite);
  if (!useSite) return null;
  if (value.publicScope !== true || value.safeForRender !== true) return null;
  if (value.containsPrivate !== false || value.containsRawUserText !== false) return null;
  return {
    useSite,
    publicScope: true,
    safeForRender: true,
    containsPrivate: false,
    containsRawUserText: false,
  };
}

function parseSource(value) {
  if (!plainObject(value) || !hasOnlyKeys(value, SOURCE_KEYS)) return null;
  const sourceId = exactToken(value.sourceId, 240);
  const sourceVersion = exactToken(value.sourceVersion);
  const origin = exactToken(value.origin);
  if (!sourceId || !sourceVersion || !SOURCE_ORIGINS.has(origin)) return null;
  return { sourceId, sourceVersion, origin };
}

function parseAuthority(value) {
  if (!plainObject(value) || !hasOnlyKeys(value, AUTHORITY_KEYS)) return null;
  if (value.mode !== 'presentation_only') return null;
  if (value.autoExecute !== false) return null;
  if (value.automaticCanonMutationAllowed !== false) return null;
  if (value.automaticRelationshipMutationAllowed !== false) return null;
  if (value.automaticGameMutationAllowed !== false) return null;
  if (value.automaticRewardMutationAllowed !== false) return null;
  return {
    mode: 'presentation_only',
    autoExecute: false,
    automaticCanonMutationAllowed: false,
    automaticRelationshipMutationAllowed: false,
    automaticGameMutationAllowed: false,
    automaticRewardMutationAllowed: false,
  };
}

function parsePresentation(purpose, value) {
  if (!plainObject(value)) return null;

  if (purpose === 'conversation_utterance') {
    if (!hasOnlyKeys(value, UTTERANCE_KEYS) || value.kind !== 'utterance') return null;
    const text = boundedText(value.text);
    return text ? { kind: 'utterance', text } : null;
  }

  if (purpose === 'advice_recommendation') {
    if (!hasOnlyKeys(value, EMPHASIS_KEYS) || value.kind !== 'candidate_emphasis') return null;
    const candidateId = exactToken(value.candidateId);
    const targetId = value.targetId === null ? null : exactToken(value.targetId);
    const alternativeCandidateId = value.alternativeCandidateId === null
      ? null
      : exactToken(value.alternativeCandidateId);
    if (!candidateId) return null;
    if (value.targetId !== null && !targetId) return null;
    if (value.alternativeCandidateId !== null && !alternativeCandidateId) return null;
    if (alternativeCandidateId === candidateId) return null;
    return { kind: 'candidate_emphasis', candidateId, targetId, alternativeCandidateId };
  }

  return null;
}

function parseInput(input, { allowOk = false } = {}) {
  if (!plainObject(input)) return { reason: 'INPUT_REQUIRED' };
  const allowed = allowOk ? PLAN_KEYS : INPUT_KEYS;
  if (!hasOnlyKeys(input, allowed)) return { reason: 'UNEXPECTED_FIELD' };
  if (allowOk && input.ok !== true) return { reason: 'PLAN_OK_REQUIRED' };
  if (input.schemaVersion !== SCHEMA_VERSION) return { reason: 'SCHEMA_VERSION_INVALID' };

  const planId = exactToken(input.planId);
  const partnerId = exactToken(input.partnerId);
  const purpose = exactToken(input.purpose);
  if (!planId || !partnerId || !PURPOSES.has(purpose)) return { reason: 'IDENTITY_OR_PURPOSE_INVALID' };

  const scope = parseScope(input.scope);
  if (!scope) return { reason: 'SCOPE_NOT_PUBLIC_SAFE' };
  const source = parseSource(input.source);
  if (!source) return { reason: 'SOURCE_INVALID' };
  const presentation = parsePresentation(purpose, input.presentation);
  if (!presentation) return { reason: 'PRESENTATION_INVALID' };
  const evidence = parseEvidence(input.evidence);
  if (!evidence) return { reason: 'EVIDENCE_INVALID' };
  const authority = parseAuthority(input.authority);
  if (!authority) return { reason: 'AUTHORITY_NOT_PRESENTATION_ONLY' };

  return {
    plan: {
      ok: true,
      schemaVersion: SCHEMA_VERSION,
      planId,
      partnerId,
      purpose,
      scope,
      source,
      presentation,
      evidence,
      authority,
    },
  };
}

function fail(reason) {
  return freezeDeep({
    ok: false,
    schemaVersion: SCHEMA_VERSION,
    reason,
    safeForRender: false,
    containsPrivate: false,
    containsRawUserText: false,
    autoExecute: false,
    automaticCanonMutationAllowed: false,
    automaticRelationshipMutationAllowed: false,
    automaticGameMutationAllowed: false,
    automaticRewardMutationAllowed: false,
  });
}

export function buildPartnerResponsePlan(input = {}) {
  const parsed = parseInput(input);
  return parsed.plan ? freezeDeep(parsed.plan) : fail(parsed.reason);
}

export function isPartnerResponsePlan(value) {
  return Boolean(parseInput(value, { allowOk: true }).plan);
}

export const PARTNER_RESPONSE_PLAN_SCHEMA_VERSION = SCHEMA_VERSION;
export const PARTNER_RESPONSE_PLAN_PURPOSES = Object.freeze([...PURPOSES]);
export const PARTNER_RESPONSE_PLAN_SOURCE_ORIGINS = Object.freeze([...SOURCE_ORIGINS]);
