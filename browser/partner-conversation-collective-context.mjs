import {
  EVIDENCE_LINEAGE_BASE_KEYS,
  exactEvidenceToken as exactToken,
  normalizeEvidenceLineage,
} from './evidence-lineage-core.mjs';

const SCHEMA_VERSION = 'gameroad.partner-conversation-collective-context.v1';
const USE_SITE = 'partner-conversation';
const ALLOWED_PROVENANCE = new Set(['server_verified', 'public_production']);
const ALLOWED_COUNTER = new Set(['PRESENT', 'NONE_FOUND']);
const ALLOWED_FRESHNESS = new Set(['current', 'current_bounded']);
const ALLOWED_FIELDS = new Set([
  ...EVIDENCE_LINEAGE_BASE_KEYS,
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

function safeSummary(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > 320) return null;
  return text;
}

function projectItem(item) {
  const lineage = normalizeEvidenceLineage(item, {
    allowedKeys: ALLOWED_FIELDS,
    allowedProvenance: ALLOWED_PROVENANCE,
    allowedFreshness: ALLOWED_FRESHNESS,
    tokenMax: 180,
    authorityMax: 240,
    observedAtMax: 64,
  });
  if (!lineage) return null;

  const counterevidenceState = exactToken(item.counterevidenceState, 180);
  const useSite = exactToken(item.useSite, 180);
  const summary = safeSummary(item.summary);
  const confidence = exactToken(item.confidence ?? 'bounded', 180);
  if (!summary || !confidence) return null;
  if (!ALLOWED_COUNTER.has(counterevidenceState)) return null;
  if (useSite !== USE_SITE) return null;

  return freezeDeep({
    promptItem: {
      evidenceId: lineage.evidenceId,
      summary,
      confidence,
      counterevidenceState,
    },
    lineage: { ...lineage, counterevidenceState },
  });
}

export function buildPartnerConversationCollectiveContext(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return freezeDeep({ ok: false, schemaVersion: SCHEMA_VERSION, reason: 'INPUT_REQUIRED', items: [], lineage: [] });
  }
  const partnerId = exactToken(input.partnerId, 180);
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

export const PARTNER_CONVERSATION_COLLECTIVE_CONTEXT_SCHEMA = SCHEMA_VERSION;
