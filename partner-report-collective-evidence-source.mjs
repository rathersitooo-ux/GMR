import { buildPartnerConversationCollectiveContext } from './partner-conversation-collective-context.mjs';

const PARTNER_ID = 'partner.saasuna';
const USE_SITE = 'partner-conversation';
const REPORT_TYPES = new Map([
  ['bug', '不具合報告'],
  ['defect', '欠陥報告'],
  ['request', '要望'],
]);
const VERSION_KEYS = Object.freeze(['rules', 'content', 'state']);
const REPORT_KEYS = new Set([
  'ok',
  'status',
  'reportId',
  'reportType',
  'disposition',
  'partnerId',
  'sourceUseSite',
  'sourceStateIdentity',
  'versions',
  'authority',
]);
const VERSION_OBJECT_KEYS = new Set(VERSION_KEYS);
const AUTHORITY_KEYS = new Set(['verified', 'authorityId']);

function exactToken(value, max = 180) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text !== value || text.length > max || /[\u0000-\u001f\u007f]/.test(text)) return null;
  return text;
}

function exactObjectKeys(value, allowed) {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).every((key) => allowed.has(key));
}

function safeVersions(value) {
  if (!exactObjectKeys(value, VERSION_OBJECT_KEYS)) return null;
  const versions = {};
  for (const key of VERSION_KEYS) {
    const token = exactToken(value[key], 96);
    if (!token) return null;
    versions[key] = token;
  }
  return Object.freeze(versions);
}

function versionsMatch(left, right) {
  return VERSION_KEYS.every((key) => left[key] === right[key]);
}

function sourceVersion(versions) {
  return exactToken(`${versions.rules}/${versions.content}/${versions.state}`);
}

function safeObservedAt(value) {
  const token = exactToken(value, 64);
  if (!token) return null;
  const parsed = Date.parse(token);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function normalizeAuthoritativeReport(reportRead) {
  if (!exactObjectKeys(reportRead, REPORT_KEYS)) return null;
  if (reportRead.ok !== true || reportRead.status !== 'ready') return null;
  const reportId = exactToken(reportRead.reportId, 160);
  const reportType = exactToken(reportRead.reportType, 32);
  const disposition = exactToken(reportRead.disposition, 32);
  const partnerId = exactToken(reportRead.partnerId, 160);
  const sourceUseSite = exactToken(reportRead.sourceUseSite, 160);
  const sourceStateIdentity = exactToken(reportRead.sourceStateIdentity, 256);
  const versions = safeVersions(reportRead.versions);
  if (!reportId || !REPORT_TYPES.has(reportType) || !disposition || !partnerId || !sourceUseSite || !sourceStateIdentity || !versions) {
    return null;
  }
  if (!exactObjectKeys(reportRead.authority, AUTHORITY_KEYS) || reportRead.authority.verified !== true) return null;
  const authorityId = exactToken(reportRead.authority.authorityId, 192);
  if (!authorityId) return null;
  return Object.freeze({
    reportId,
    reportType,
    disposition,
    partnerId,
    sourceUseSite,
    sourceStateIdentity,
    versions,
    authorityId,
  });
}

export function projectPartnerReportCollectiveEvidence(reportRead, {
  currentVersions,
  observedAt,
} = {}) {
  const report = normalizeAuthoritativeReport(reportRead);
  const current = safeVersions(currentVersions);
  const observed = safeObservedAt(observedAt);
  if (!report || !current || !observed) return null;
  if (report.partnerId !== PARTNER_ID || report.disposition !== 'accepted_unique') return null;
  if (!versionsMatch(report.versions, current)) return null;
  const version = sourceVersion(report.versions);
  if (!version) return null;

  const reportLabel = REPORT_TYPES.get(report.reportType);
  const summary = `${report.sourceUseSite}で${reportLabel}が1件、現行版に対するサーバー確認済みの重複なし報告として受理されています。参考情報であり、人物設定・関係値・ゲーム仕様を変更しません。`;
  const context = buildPartnerConversationCollectiveContext({
    partnerId: PARTNER_ID,
    evidenceItems: [{
      evidenceId: `partner-report:${report.reportId}`,
      sourceId: report.authorityId,
      sourceVersion: version,
      provenance: 'server_verified',
      authorityRef: report.authorityId,
      observedAt: observed,
      freshness: 'current_bounded',
      counterevidenceState: 'PRESENT',
      useSite: USE_SITE,
      summary,
      confidence: 'bounded',
    }],
  });
  if (!context?.ok || context.acceptedCount !== 1) return null;
  return context;
}

export function createPartnerReportCollectiveEvidenceSource({
  readAdjudicatedReport,
  getCurrentVersions,
  now = () => new Date().toISOString(),
} = {}) {
  if (typeof readAdjudicatedReport !== 'function') throw new TypeError('readAdjudicatedReport must be a function');
  if (typeof getCurrentVersions !== 'function') throw new TypeError('getCurrentVersions must be a function');
  if (typeof now !== 'function') throw new TypeError('now must be a function');

  return async function partnerReportCollectiveEvidenceSource(request = {}) {
    if (request?.partnerId !== PARTNER_ID || request?.useSite !== USE_SITE) return null;
    let reportRead;
    let currentVersions;
    let observedAt;
    try {
      reportRead = await readAdjudicatedReport();
      currentVersions = await getCurrentVersions();
      observedAt = now();
    } catch {
      return null;
    }
    return projectPartnerReportCollectiveEvidence(reportRead, { currentVersions, observedAt });
  };
}

export const PARTNER_REPORT_COLLECTIVE_EVIDENCE_SOURCE_CONTRACT = Object.freeze({
  partnerId: PARTNER_ID,
  useSite: USE_SITE,
  requiredDisposition: 'accepted_unique',
  provenance: 'server_verified',
  freshness: 'current_bounded',
  counterevidenceState: 'PRESENT',
  rawReportTextUsed: false,
  secondStoreCreated: false,
  automaticCanonMutationAllowed: false,
  automaticRelationshipMutationAllowed: false,
  automaticGameMutationAllowed: false,
});
