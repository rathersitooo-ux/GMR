const PROJECTION_SCHEMA = 'GAMEROAD_PARTNER_REPORT_CONTRIBUTION_PROJECTION_V1';
const REPORT_TYPES = new Set(['bug', 'defect', 'request']);
const DISPOSITIONS = new Set(['accepted_unique', 'duplicate', 'rejected']);
const VERSION_KEYS = Object.freeze(['rules', 'content', 'state']);

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function safeVersions(versions) {
  if (!versions || typeof versions !== 'object' || Array.isArray(versions)) return null;
  const projected = {};
  for (const key of VERSION_KEYS) {
    if (!nonEmptyString(versions[key])) return null;
    projected[key] = versions[key];
  }
  return projected;
}

function safeAuthority(authority) {
  if (!authority || typeof authority !== 'object' || Array.isArray(authority)) return null;
  if (authority.verified !== true || !nonEmptyString(authority.authorityId)) return null;
  return { verified: true, authorityId: authority.authorityId };
}

function eventContentIdentity({
  partnerId,
  reportType,
  sourceUseSite,
  sourceStateIdentity,
  versions,
  authorityId
}) {
  return [
    'report_contribution',
    partnerId,
    reportType,
    sourceUseSite,
    sourceStateIdentity,
    versions.rules,
    versions.content,
    versions.state,
    authorityId
  ].join('|');
}

export function projectPartnerReportContribution(reportRead) {
  if (!reportRead || typeof reportRead !== 'object' || Array.isArray(reportRead)) {
    return deepFreeze({ ok: false, reason: 'REPORT_READ_INVALID' });
  }
  if (reportRead.ok !== true || reportRead.status !== 'ready') {
    return deepFreeze({ ok: false, reason: 'REPORT_NOT_READY' });
  }

  if (!nonEmptyString(reportRead.reportId) ||
      !REPORT_TYPES.has(reportRead.reportType) ||
      !DISPOSITIONS.has(reportRead.disposition) ||
      !nonEmptyString(reportRead.partnerId) ||
      !nonEmptyString(reportRead.sourceUseSite) ||
      !nonEmptyString(reportRead.sourceStateIdentity)) {
    return deepFreeze({ ok: false, reason: 'REPORT_IDENTITY_OR_DISPOSITION_INVALID' });
  }

  const versions = safeVersions(reportRead.versions);
  const authority = safeAuthority(reportRead.authority);
  if (!versions || !authority) {
    return deepFreeze({ ok: false, reason: 'REPORT_VERSION_OR_AUTHORITY_INVALID' });
  }

  const base = {
    ok: true,
    schema: PROJECTION_SCHEMA,
    reportId: reportRead.reportId,
    reportType: reportRead.reportType,
    disposition: reportRead.disposition,
    partnerId: reportRead.partnerId,
    sourceUseSite: reportRead.sourceUseSite,
    sourceStateIdentity: reportRead.sourceStateIdentity,
    versions,
    authority
  };

  if (reportRead.disposition !== 'accepted_unique') {
    return deepFreeze({
      ...base,
      contributionEligible: false,
      relationshipHandoffCandidate: null
    });
  }

  const eventIdentity = `partner-report:${reportRead.reportId}`;
  const contentIdentity = eventContentIdentity({
    partnerId: reportRead.partnerId,
    reportType: reportRead.reportType,
    sourceUseSite: reportRead.sourceUseSite,
    sourceStateIdentity: reportRead.sourceStateIdentity,
    versions,
    authorityId: authority.authorityId
  });

  return deepFreeze({
    ...base,
    contributionEligible: true,
    relationshipHandoffCandidate: {
      eventIdentity,
      eventContentIdentity: contentIdentity,
      eventType: 'report_contribution',
      partnerId: reportRead.partnerId,
      sourceUseSite: reportRead.sourceUseSite,
      sourceStateIdentity: reportRead.sourceStateIdentity,
      rulesContentVersion: {
        rules: versions.rules,
        content: versions.content,
        state: versions.state
      },
      authorityValidation: authority,
      sourceReportType: reportRead.reportType,
      sourceDisposition: reportRead.disposition
    }
  });
}

export function createPartnerReportContributionConsumerAdapter({
  readAdjudicatedReport,
  consumeRelationshipHandoff
} = {}) {
  if (typeof readAdjudicatedReport !== 'function') {
    throw new TypeError('readAdjudicatedReport must be a function');
  }
  if (typeof consumeRelationshipHandoff !== 'function') {
    throw new TypeError('consumeRelationshipHandoff must be a function');
  }

  return function consumePartnerReportContribution() {
    let reportRead;
    try {
      reportRead = readAdjudicatedReport();
    } catch {
      return deepFreeze({ ok: false, consumed: false, reason: 'REPORT_READ_FAILED' });
    }

    const projection = projectPartnerReportContribution(reportRead);
    if (!projection.ok) {
      return deepFreeze({ ok: false, consumed: false, reason: projection.reason });
    }

    if (!projection.contributionEligible) {
      return deepFreeze({
        ok: true,
        consumed: false,
        contributionEligible: false,
        reportId: projection.reportId,
        disposition: projection.disposition
      });
    }

    try {
      consumeRelationshipHandoff(projection.relationshipHandoffCandidate);
    } catch {
      return deepFreeze({ ok: false, consumed: false, reason: 'RELATIONSHIP_CONSUMER_FAILED' });
    }

    return deepFreeze({
      ok: true,
      consumed: true,
      contributionEligible: true,
      reportId: projection.reportId,
      eventIdentity: projection.relationshipHandoffCandidate.eventIdentity,
      eventContentIdentity: projection.relationshipHandoffCandidate.eventContentIdentity
    });
  };
}

export const PARTNER_REPORT_CONTRIBUTION_EVENT_SOURCE = Object.freeze({
  schema: PROJECTION_SCHEMA,
  sourceAuthority: 'already-authoritatively-adjudicated report result',
  acceptedReportTypes: Object.freeze(['bug', 'defect', 'request']),
  acceptedDisposition: 'accepted_unique',
  nonContributionDispositions: Object.freeze(['duplicate', 'rejected']),
  storageAuthority: 'NONE',
  rawReportTextPolicy: 'NEVER_PROJECT_RAW_REPORT_TEXT',
  goodBadPolicy: 'SEPARATE_CONVERSATION_QUALITY_SIGNAL_NOT_A_REPORT_CONTRIBUTION',
  relationshipMutationPolicy: 'HANDOFF_CANDIDATE_ONLY_NO_NUMERIC_DELTA',
  exactlyOncePolicy: 'STABLE_EVENT_IDENTITY_AND_CONTENT_IDENTITY_FOR_RELATIONSHIP_OWNER'
});
