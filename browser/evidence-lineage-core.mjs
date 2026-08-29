export const EVIDENCE_LINEAGE_BASE_KEYS = Object.freeze([
  'evidenceId',
  'sourceId',
  'sourceVersion',
  'provenance',
  'authorityRef',
  'observedAt',
  'freshness',
]);

const DEFAULT_ALLOWED_KEYS = new Set(EVIDENCE_LINEAGE_BASE_KEYS);

function asPolicySet(value) {
  if (value instanceof Set) return value.size > 0 ? value : null;
  if (Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string' && item)) {
    return new Set(value);
  }
  return null;
}

function asAllowedKeySet(value) {
  if (value === undefined) return DEFAULT_ALLOWED_KEYS;
  return asPolicySet(value);
}

export function exactEvidenceToken(value, max = 160) {
  if (!Number.isInteger(max) || max <= 0) return null;
  if (typeof value !== 'string' || !value || value.length > max || value.trim() !== value) return null;
  return value;
}

export function normalizeEvidenceLineage(item, {
  allowedKeys,
  allowedProvenance,
  allowedFreshness,
  tokenMax = 160,
  authorityMax = 240,
  observedAtMax = 80,
} = {}) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;

  const keyPolicy = asAllowedKeySet(allowedKeys);
  const provenancePolicy = asPolicySet(allowedProvenance);
  const freshnessPolicy = asPolicySet(allowedFreshness);
  if (!keyPolicy || !provenancePolicy || !freshnessPolicy) return null;
  if (Object.keys(item).some((key) => !keyPolicy.has(key))) return null;

  const evidenceId = exactEvidenceToken(item.evidenceId, tokenMax);
  const sourceId = exactEvidenceToken(item.sourceId, tokenMax);
  const sourceVersion = exactEvidenceToken(item.sourceVersion, tokenMax);
  const provenance = exactEvidenceToken(item.provenance, tokenMax);
  const authorityRef = exactEvidenceToken(item.authorityRef, authorityMax);
  const observedAt = exactEvidenceToken(item.observedAt, observedAtMax);
  const freshness = exactEvidenceToken(item.freshness, tokenMax);

  if (!evidenceId || !sourceId || !sourceVersion || !provenance || !authorityRef || !observedAt || !freshness) return null;
  if (!provenancePolicy.has(provenance) || !freshnessPolicy.has(freshness)) return null;

  return Object.freeze({
    evidenceId,
    sourceId,
    sourceVersion,
    provenance,
    authorityRef,
    observedAt,
    freshness,
  });
}
