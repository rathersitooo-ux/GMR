const SCHEMA = 'gameroad.external-creative-submission.v1';
const CONTENT_KINDS = new Set(['IDEA', 'FAN_ART']);
const SOURCE_KINDS = new Set(['GAMEROAD_FORM', 'X', 'BLUESKY', 'OTHER_PUBLIC']);
const DECLARED_ORIGINS = new Set(['HUMAN', 'AI_ASSISTED', 'AI_GENERATED', 'UNKNOWN']);
const CONSENT_SCOPES = new Set(['ANALYSIS_ONLY', 'DISPLAY_AND_ANALYSIS', 'ELIGIBLE_FOR_HUMAN_FORMAL_REVIEW']);
const ALLOWED_FIELDS = new Set([
  'submissionId',
  'contentKind',
  'source',
  'campaignId',
  'submittedAt',
  'contentRef',
  'contentDigest',
  'declaredOrigin',
  'consentUseScope',
  'containsPrivate',
  'containsCredentials',
]);
const ALLOWED_SOURCE_FIELDS = new Set(['kind', 'url', 'externalPostId']);

function safeToken(value, max = 96) {
  if (typeof value !== 'string') return null;
  const token = value.trim();
  if (!token || token.length > max) return null;
  return token;
}

function safeSha256(value) {
  const token = safeToken(value, 64);
  return token && /^[a-f0-9]{64}$/i.test(token) ? token.toLowerCase() : null;
}

function safeHttpsUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function normalizedIsoDate(value) {
  if (typeof value !== 'string' || value.length > 64) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function unexpectedFields(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.keys(value).filter((key) => !allowed.has(key)).sort();
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

export function normalizeExternalCreativeSubmission(input) {
  const reasons = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return deepFreeze({ ok: false, reasons: ['invalid-input'], candidate: null });
  }

  for (const field of unexpectedFields(input, ALLOWED_FIELDS)) reasons.push(`unexpected-field:${field}`);

  const submissionId = safeToken(input.submissionId);
  if (!submissionId) reasons.push('submissionId-invalid');

  const contentKind = safeToken(input.contentKind);
  if (!CONTENT_KINDS.has(contentKind)) reasons.push('contentKind-invalid');

  const source = input.source;
  if (!source || typeof source !== 'object' || Array.isArray(source)) reasons.push('source-invalid');
  else for (const field of unexpectedFields(source, ALLOWED_SOURCE_FIELDS)) reasons.push(`source-unexpected-field:${field}`);

  const sourceKind = safeToken(source?.kind);
  if (!SOURCE_KINDS.has(sourceKind)) reasons.push('source-kind-invalid');
  const sourceUrl = source?.url == null ? null : safeHttpsUrl(source.url);
  if (source?.url != null && !sourceUrl) reasons.push('source-url-invalid');
  if (sourceKind !== 'GAMEROAD_FORM' && !sourceUrl) reasons.push('source-url-required');
  const externalPostId = source?.externalPostId == null ? null : safeToken(source.externalPostId);
  if (source?.externalPostId != null && !externalPostId) reasons.push('externalPostId-invalid');

  const campaignId = input.campaignId == null ? null : safeToken(input.campaignId);
  if (input.campaignId != null && !campaignId) reasons.push('campaignId-invalid');

  const submittedAt = normalizedIsoDate(input.submittedAt);
  if (!submittedAt) reasons.push('submittedAt-invalid');

  const contentRef = safeToken(input.contentRef, 512);
  if (!contentRef) reasons.push('contentRef-invalid');
  const contentDigest = input.contentDigest == null ? null : safeSha256(input.contentDigest);
  if (input.contentDigest != null && !contentDigest) reasons.push('contentDigest-invalid');

  const declaredOrigin = safeToken(input.declaredOrigin);
  if (!DECLARED_ORIGINS.has(declaredOrigin)) reasons.push('declaredOrigin-invalid');

  const consentUseScope = safeToken(input.consentUseScope);
  if (!CONSENT_SCOPES.has(consentUseScope)) reasons.push('consentUseScope-invalid');

  if (input.containsPrivate !== false) reasons.push('private-data-not-explicitly-false');
  if (input.containsCredentials !== false) reasons.push('credential-data-not-explicitly-false');

  const uniqueReasons = [...new Set(reasons)].sort();
  if (uniqueReasons.length > 0) {
    return deepFreeze({ ok: false, reasons: uniqueReasons, candidate: null });
  }

  return deepFreeze({
    ok: true,
    reasons: [],
    candidate: {
      schema: SCHEMA,
      submissionId,
      contentKind,
      source: {
        kind: sourceKind,
        url: sourceUrl,
        externalPostId,
        authority: 'PROVENANCE_ONLY',
      },
      campaignId,
      submittedAt,
      contentRef,
      contentDigest,
      declaredOrigin: {
        value: declaredOrigin,
        authority: 'SELF_DECLARED_NOT_VERIFIED',
      },
      consentUseScope,
      identityAuthority: 'GAMEROAD_SUBMISSION_ID',
      evidenceState: 'CANDIDATE_ONLY',
      reward: {
        state: 'PENDING_OR_UNKNOWN',
        automaticGrantAllowed: false,
        amount: null,
        rewardIdentity: null,
      },
      formalWork: {
        approved: false,
        humanApprovalRequired: true,
        provenanceAndUseScopeRequired: true,
      },
      automaticMutationAllowed: false,
      containsPrivate: false,
      containsCredentials: false,
    },
  });
}
