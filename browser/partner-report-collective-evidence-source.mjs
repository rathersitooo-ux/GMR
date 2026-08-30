import {
  projectPartnerReportContribution,
} from './partner-report-contribution-event-source.mjs';
import {
  buildPartnerConversationCollectiveContext,
  PARTNER_CONVERSATION_COLLECTIVE_CONTEXT_SCHEMA,
} from './partner-conversation-collective-context.mjs';

const SOURCE_SCHEMA = 'gameroad.partner-report-collective-evidence-source.v1';
const USE_SITE = 'partner-conversation';
const SOURCE_ID = 'partner-report-authority';
const MAX_SOURCE_REPORTS = 16;
const MAX_EVIDENCE_ITEMS = 4;

function nonEmptyToken(value, max = 180) {
  return typeof value === 'string' && value.length > 0 && value.length <= max && value.trim() === value
    ? value
    : null;
}

function currentObservedAt(clock) {
  const value = clock();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function reportSourceVersion(versions) {
  if (!versions || typeof versions !== 'object' || Array.isArray(versions)) return null;
  const tokens = ['rules', 'content', 'state'].map((key) => nonEmptyToken(versions[key], 48));
  if (tokens.some((token) => !token)) return null;
  return nonEmptyToken(tokens.join('|'));
}

function reportSummary(reportType) {
  if (reportType === 'request') {
    return 'Current server-verified report contribution records an accepted request for this partner.';
  }
  if (reportType === 'bug' || reportType === 'defect') {
    return 'Current server-verified report contribution records an accepted issue for this partner.';
  }
  return null;
}

function projectEvidenceItem(reportRead, { partnerId, observedAt }) {
  const projection = projectPartnerReportContribution(reportRead);
  if (!projection.ok || !projection.contributionEligible) return null;
  if (projection.partnerId !== partnerId) return null;

  const candidate = projection.relationshipHandoffCandidate;
  if (!candidate || candidate.sourceDisposition !== 'accepted_unique') return null;
  if (candidate.authorityValidation?.verified !== true) return null;

  const evidenceId = nonEmptyToken(candidate.eventIdentity);
  const sourceVersion = reportSourceVersion(projection.versions);
  const authorityRef = nonEmptyToken(candidate.authorityValidation.authorityId, 240);
  const summary = reportSummary(projection.reportType);
  if (!evidenceId || !sourceVersion || !authorityRef || !summary) return null;

  return Object.freeze({
    evidenceId,
    sourceId: SOURCE_ID,
    sourceVersion,
    provenance: 'server_verified',
    authorityRef,
    observedAt,
    freshness: 'current',
    counterevidenceState: 'NONE_FOUND',
    useSite: USE_SITE,
    summary,
    confidence: 'server_verified',
  });
}

export function createPartnerReportCollectiveEvidenceSource({
  readCurrentAdjudicatedReports,
  clock = () => new Date(),
} = {}) {
  if (typeof readCurrentAdjudicatedReports !== 'function') {
    throw new TypeError('readCurrentAdjudicatedReports must be a function');
  }
  if (typeof clock !== 'function') {
    throw new TypeError('clock must be a function');
  }

  return function readPartnerReportCollectiveEvidence(request = {}) {
    const partnerId = nonEmptyToken(request?.partnerId);
    if (!partnerId || request?.useSite !== USE_SITE || request?.schemaVersion !== PARTNER_CONVERSATION_COLLECTIVE_CONTEXT_SCHEMA) {
      return null;
    }

    const observedAt = currentObservedAt(clock);
    if (!observedAt) return null;

    let reportReads;
    try {
      reportReads = readCurrentAdjudicatedReports();
    } catch {
      return null;
    }
    if (!Array.isArray(reportReads)) return null;

    const evidenceItems = [];
    for (const reportRead of reportReads.slice(0, MAX_SOURCE_REPORTS)) {
      const evidenceItem = projectEvidenceItem(reportRead, { partnerId, observedAt });
      if (!evidenceItem) continue;
      evidenceItems.push(evidenceItem);
      if (evidenceItems.length >= MAX_EVIDENCE_ITEMS) break;
    }
    if (!evidenceItems.length) return null;

    const context = buildPartnerConversationCollectiveContext({ partnerId, evidenceItems });
    if (!context.ok || context.acceptedCount === 0 || context.safeForPrompt !== true) return null;
    return context;
  };
}

export const PARTNER_REPORT_COLLECTIVE_EVIDENCE_SOURCE = Object.freeze({
  schema: SOURCE_SCHEMA,
  inputAuthority: 'CURRENT_AUTHORITATIVE_PARTNER_REPORT_READ',
  outputSchema: PARTNER_CONVERSATION_COLLECTIVE_CONTEXT_SCHEMA,
  useSite: USE_SITE,
  storageAuthority: 'NONE',
  cachePolicy: 'NONE_DIRECT_CURRENT_READ_EACH_CALL',
  rawReportTextPolicy: 'NEVER_PROJECT_RAW_REPORT_TEXT',
  automaticMutationPolicy: 'NONE',
  maxSourceReports: MAX_SOURCE_REPORTS,
  maxEvidenceItems: MAX_EVIDENCE_ITEMS,
});
