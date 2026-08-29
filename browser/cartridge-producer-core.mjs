export const CARTRIDGE_PRODUCER_SCHEMA_VERSION = 'gameroad.cartridge-producer-candidate.v1';

export const CARTRIDGE_PRODUCER_KINDS = Object.freeze([
  'EXISTING_MAKER',
  'CHATGPT',
  'SAASUNA',
  'IN_GAME_MAKER',
]);

export const CARTRIDGE_DECLARED_ORIGINS = Object.freeze([
  'HUMAN',
  'AI_ASSISTED',
  'AI_GENERATED',
  'SYSTEM',
  'UNKNOWN',
]);

export const CARTRIDGE_USE_SCOPES = Object.freeze([
  'LOCAL_PRIVATE',
  'FORMAL_REVIEW_CANDIDATE',
]);

export const CARTRIDGE_RIGHTS_STATUSES = Object.freeze([
  'SELF_CREATED',
  'LICENSED',
  'PUBLIC_DOMAIN',
  'UNKNOWN',
]);

const PRODUCER_KIND_SET = new Set(CARTRIDGE_PRODUCER_KINDS);
const ORIGIN_SET = new Set(CARTRIDGE_DECLARED_ORIGINS);
const USE_SCOPE_SET = new Set(CARTRIDGE_USE_SCOPES);
const RIGHTS_SET = new Set(CARTRIDGE_RIGHTS_STATUSES);
const TOP_FIELDS = new Set(['schemaVersion', 'producerKind', 'requestId', 'sourceId', 'manifest', 'provenance', 'controls']);
const PROVENANCE_FIELDS = new Set([
  'declaredOrigin',
  'useScope',
  'rightsStatus',
  'sourceRef',
  'sourceDigest',
  'containsPrivate',
  'containsCredentials',
]);
const CONTROL_FIELDS = new Set([
  'candidateOnly',
  'automaticInstall',
  'automaticPublish',
  'automaticRanked',
  'automaticReward',
  'automaticCanonMutation',
  'automaticRelationshipMutation',
]);
const SHA256_RE = /^[a-f0-9]{64}$/i;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function cleanString(value, { max = 512, optional = false } = {}) {
  if (value == null && optional) return null;
  if (typeof value !== 'string' || value !== value.trim() || value.includes('\u0000') || value.length > max) return null;
  if (!optional && value.length === 0) return null;
  return value || null;
}

function unexpectedFields(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.keys(value).filter((field) => !allowed.has(field)).sort();
}

function normalizeProvenance(input, reasons) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    reasons.push('provenance-invalid');
    return null;
  }
  for (const field of unexpectedFields(input, PROVENANCE_FIELDS)) reasons.push(`provenance-unexpected-field:${field}`);

  const declaredOrigin = cleanString(input.declaredOrigin, { max: 32 });
  if (!ORIGIN_SET.has(declaredOrigin)) reasons.push('declaredOrigin-invalid');
  const useScope = cleanString(input.useScope, { max: 48 });
  if (!USE_SCOPE_SET.has(useScope)) reasons.push('useScope-invalid');
  const rightsStatus = cleanString(input.rightsStatus, { max: 32 });
  if (!RIGHTS_SET.has(rightsStatus)) reasons.push('rightsStatus-invalid');
  const sourceRef = cleanString(input.sourceRef, { max: 2048, optional: true });
  if (input.sourceRef != null && sourceRef == null) reasons.push('sourceRef-invalid');
  const sourceDigest = cleanString(input.sourceDigest, { max: 64, optional: true });
  if (sourceDigest != null && !SHA256_RE.test(sourceDigest)) reasons.push('sourceDigest-invalid');
  if (typeof input.containsPrivate !== 'boolean') reasons.push('containsPrivate-invalid');
  if (typeof input.containsCredentials !== 'boolean') reasons.push('containsCredentials-invalid');

  if (!ORIGIN_SET.has(declaredOrigin) || !USE_SCOPE_SET.has(useScope) || !RIGHTS_SET.has(rightsStatus)) return null;
  return {
    declaredOrigin,
    useScope,
    rightsStatus,
    sourceRef,
    sourceDigest: sourceDigest?.toLowerCase() ?? null,
    containsPrivate: input.containsPrivate === true,
    containsCredentials: input.containsCredentials === true,
  };
}

function normalizeControls(input, reasons) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    reasons.push('controls-invalid');
    return null;
  }
  for (const field of unexpectedFields(input, CONTROL_FIELDS)) reasons.push(`controls-unexpected-field:${field}`);
  const requiredFalse = [
    'automaticInstall',
    'automaticPublish',
    'automaticRanked',
    'automaticReward',
    'automaticCanonMutation',
    'automaticRelationshipMutation',
  ];
  if (input.candidateOnly !== true) reasons.push('candidateOnly-required');
  for (const field of requiredFalse) if (input[field] !== false) reasons.push(`${field}-must-be-false`);
  if (reasons.some((reason) => reason.startsWith('controls-') || reason.endsWith('-must-be-false') || reason === 'candidateOnly-required')) return null;
  return {
    candidateOnly: true,
    automaticInstall: false,
    automaticPublish: false,
    automaticRanked: false,
    automaticReward: false,
    automaticCanonMutation: false,
    automaticRelationshipMutation: false,
  };
}

export function defaultCartridgeProducerControls() {
  return deepFreeze({
    candidateOnly: true,
    automaticInstall: false,
    automaticPublish: false,
    automaticRanked: false,
    automaticReward: false,
    automaticCanonMutation: false,
    automaticRelationshipMutation: false,
  });
}

export function normalizeCartridgeProducerCandidate(input) {
  const reasons = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return deepFreeze({ ok: false, reasons: ['candidate-invalid'], candidate: null });
  }
  for (const field of unexpectedFields(input, TOP_FIELDS)) reasons.push(`unexpected-field:${field}`);
  if (input.schemaVersion !== CARTRIDGE_PRODUCER_SCHEMA_VERSION) reasons.push('schemaVersion-invalid');

  const producerKind = cleanString(input.producerKind, { max: 32 });
  if (!PRODUCER_KIND_SET.has(producerKind)) reasons.push('producerKind-invalid');
  const requestId = cleanString(input.requestId, { max: 240 });
  if (!requestId) reasons.push('requestId-invalid');
  const sourceId = cleanString(input.sourceId, { max: 512 });
  if (!sourceId) reasons.push('sourceId-invalid');
  if (!input.manifest || typeof input.manifest !== 'object' || Array.isArray(input.manifest)) reasons.push('manifest-invalid');

  const provenance = normalizeProvenance(input.provenance, reasons);
  const controls = normalizeControls(input.controls, reasons);
  const uniqueReasons = [...new Set(reasons)].sort();
  if (uniqueReasons.length > 0) return deepFreeze({ ok: false, reasons: uniqueReasons, candidate: null });

  return deepFreeze({
    ok: true,
    reasons: [],
    candidate: {
      schemaVersion: CARTRIDGE_PRODUCER_SCHEMA_VERSION,
      producerKind,
      requestId,
      sourceId,
      manifest: structuredClone(input.manifest),
      provenance,
      controls,
      authority: 'CANDIDATE_ONLY',
    },
  });
}

export function createCartridgeProducerCandidate({
  producerKind,
  requestId,
  sourceId,
  manifest,
  provenance,
} = {}) {
  const normalized = normalizeCartridgeProducerCandidate({
    schemaVersion: CARTRIDGE_PRODUCER_SCHEMA_VERSION,
    producerKind,
    requestId,
    sourceId,
    manifest,
    provenance,
    controls: defaultCartridgeProducerControls(),
  });
  if (!normalized.ok) throw new Error(`CARTRIDGE_PRODUCER_CANDIDATE_INVALID:${normalized.reasons.join(',')}`);
  return normalized.candidate;
}

export function createExistingMakerCartridgeCandidate(input = {}) {
  return createCartridgeProducerCandidate({ ...input, producerKind: 'EXISTING_MAKER' });
}

export function createInGameMakerCartridgeCandidate(input = {}) {
  return createCartridgeProducerCandidate({ ...input, producerKind: 'IN_GAME_MAKER' });
}
