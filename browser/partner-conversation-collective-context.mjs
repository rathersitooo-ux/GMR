const SCHEMA_VERSION = 'gameroad.partner-conversation-collective-context.v1';
const COMMON_LINEAGE_SCHEMA = 'gameroad.collective-evidence-lineage.v1';
const USE_SITE = 'partner-conversation';
const ALLOWED_PROVENANCE = new Set(['server_verified', 'public_production']);
const ALLOWED_COUNTER = new Set(['PRESENT', 'NONE_FOUND']);
const ALLOWED_FRESHNESS = new Set(['current', 'current_bounded']);
const ALLOWED_FIELDS = new Set([
  'evidenceId',
  'sourceId',
  'sourceVersion',
  'provenance',
  'authorityRef',
  'observedAt',
  'freshness',
  'counterevidenceState',
  'useSite',
  'summary',
  'confidence',
]);

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}

function exactToken(value, max = 180) {
  if (typeof value !== 'string' || !value || value.length > max || value.trim() !== value) return null;
  return value;
}

function safeSummary(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > 320) return null;
  return text;
}

function policySet(value, fallback) {
  if (value == null) return fallback;
  if (value instanceof Set) return value;
  if (Array.isArray(value)) return new Set(value);
  return new Set();
}

/**
 * Produces the neutral, versioned evidence lineage shared by collective-data consumers.
 * This projection is descriptive only: each consumer keeps its own authority/release gate.
 */
export function normalizeCollectiveEvidenceLineage(item, policy = {}) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;

  const evidenceId = exactToken(item.evidenceId);
  const sourceId = exactToken(item.sourceId);
  const sourceVersion = exactToken(item.sourceVersion, 1024);
  const provenance = exactToken(item.provenance);
  const authorityRef = exactToken(item.authorityRef, 240);
  const observedAt = exactToken(item.observedAt, 128);
  const freshness = exactToken(item.freshness);
  const counterevidenceState = exactToken(item.counterevidenceState);

  if (!evidenceId || !sourceId || !sourceVersion || !provenance || !authorityRef || !observedAt || !freshness || !counterevidenceState) {
    return null;
  }

  const allowedProvenance = policySet(policy.allowedProvenance, null);
  const allowedFreshness = policySet(policy.allowedFreshness, ALLOWED_FRESHNESS);
  const allowedCounter = policySet(policy.allowedCounterevidenceState, ALLOWED_COUNTER);
  if (allowedProvenance && !allowedProvenance.has(provenance)) return null;
  if (!allowedFreshness.has(freshness)) return null;
  if (!allowedCounter.has(counterevidenceState)) return null;

  return freezeDeep({
    evidenceId,
    sourceId,
    sourceVersion,
    provenance,
    authorityRef,
    observedAt,
    freshness,
    counterevidenceState,
  });
}

function hasUnexpectedFields(item) {
  return Object.keys(item).some((key) => !ALLOWED_FIELDS.has(key));
}

function projectItem(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item) || hasUnexpectedFields(item)) return null;
  if (!exactToken(item.sourceVersion) || !exactToken(item.observedAt, 64)) return null;
  const lineage = normalizeCollectiveEvidenceLineage(item, { allowedProvenance: ALLOWED_PROVENANCE });
  const useSite = exactToken(item.useSite);
  const summary = safeSummary(item.summary);
  const confidence = exactToken(item.confidence ?? 'bounded');

  if (!lineage || !summary || !confidence || useSite !== USE_SITE) return null;

  return freezeDeep({
    promptItem: {
      evidenceId: lineage.evidenceId,
      summary,
      confidence,
      counterevidenceState: lineage.counterevidenceState,
    },
    lineage,
  });
}

export function buildPartnerConversationCollectiveContext(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return freezeDeep({ ok: false, schemaVersion: SCHEMA_VERSION, reason: 'INPUT_REQUIRED', items: [], lineage: [] });
  }
  const partnerId = exactToken(input.partnerId);
  if (!partnerId) {
    return freezeDeep({ ok: false, schemaVersion: SCHEMA_VERSION, reason: 'PARTNER_ID_REQUIRED', items: [], lineage: [] });
  }
  if (!Array.isArray(input.evidenceItems)) {
    return freezeDeep({ ok: false, schemaVersion: SCHEMA_VERSION, reason: 'EVIDENCE_ITEMS_REQUIRED', items: [], lineage: [] });
  }

  const accepted = [];
  let rejectedCount = 0;
  for (const item of input.evidenceItems) {
    const projected = projectItem(item);
    if (projected) accepted.push(projected);
    else rejectedCount += 1;
  }

  const deduped = [];
  const seen = new Set();
  for (const item of accepted) {
    if (seen.has(item.lineage.evidenceId)) continue;
    seen.add(item.lineage.evidenceId);
    deduped.push(item);
  }

  return freezeDeep({
    ok: true,
    schemaVersion: SCHEMA_VERSION,
    lineageSchemaVersion: COMMON_LINEAGE_SCHEMA,
    partnerId,
    useSite: USE_SITE,
    safeForPrompt: true,
    containsPrivate: false,
    containsRawUserText: false,
    items: deduped.map((item) => item.promptItem),
    lineage: deduped.map((item) => item.lineage),
    acceptedCount: deduped.length,
    rejectedCount,
    automaticCanonMutationAllowed: false,
    automaticRelationshipMutationAllowed: false,
    automaticGameMutationAllowed: false,
    secondRecorderCreated: false,
  });
}

export const COLLECTIVE_EVIDENCE_LINEAGE_SCHEMA = COMMON_LINEAGE_SCHEMA;
export const PARTNER_CONVERSATION_COLLECTIVE_CONTEXT_SCHEMA = SCHEMA_VERSION;
