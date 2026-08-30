export const PARTNER_REPORT_AUTHORITY_ID = 'gameroad.partner-report.authority.v1';
export const PARTNER_REPORT_RECORD_PREFIX = 'partner-report/report/';
export const PARTNER_REPORT_IDEMPOTENCY_PREFIX = 'partner-report/idempotency/';
export const PARTNER_REPORT_CANONICAL_PREFIX = 'partner-report/canonical/';

const REPORT_TYPES = new Set(['bug', 'defect', 'request']);
const VERSION_KEYS = Object.freeze(['rules', 'content', 'state']);
const MAX_REQUEST_BYTES = 4096;

function reject(reason) {
  return { ok: false, reason };
}

function exactToken(value, max = 192) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text !== value || text.length > max || /[\u0000-\u001f\u007f]/.test(text)) return null;
  return text;
}

function safeVersions(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const versions = {};
  for (const key of VERSION_KEYS) {
    const token = exactToken(value[key], 96);
    if (!token) return null;
    versions[key] = token;
  }
  return versions;
}

function normalizeSubmit(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const idempotencyKey = exactToken(input.idempotencyKey, 160);
  const partnerId = exactToken(input.partnerId, 160);
  const reportType = exactToken(input.reportType, 32);
  const sourceUseSite = exactToken(input.sourceUseSite, 160);
  const sourceStateIdentity = exactToken(input.sourceStateIdentity, 256);
  const versions = safeVersions(input.versions);
  if (!idempotencyKey || !partnerId || !REPORT_TYPES.has(reportType) || !sourceUseSite || !sourceStateIdentity || !versions) {
    return null;
  }
  return { idempotencyKey, partnerId, reportType, sourceUseSite, sourceStateIdentity, versions };
}

function normalizeRead(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const reportId = exactToken(input.reportId, 160);
  return reportId ? { reportId } : null;
}

function enc(value) {
  return encodeURIComponent(String(value));
}

function reportKey(reportId) {
  return `${PARTNER_REPORT_RECORD_PREFIX}${enc(reportId)}`;
}

function idempotencyStorageKey(idempotencyKey) {
  return `${PARTNER_REPORT_IDEMPOTENCY_PREFIX}${enc(idempotencyKey)}`;
}

function canonicalIdentity(input) {
  return [
    input.partnerId,
    input.reportType,
    input.sourceUseSite,
    input.sourceStateIdentity,
    input.versions.rules,
    input.versions.content,
    input.versions.state,
  ].join('\u001f');
}

function canonicalStorageKey(input) {
  return `${PARTNER_REPORT_CANONICAL_PREFIX}${enc(canonicalIdentity(input))}`;
}

function publicReport(record) {
  if (!record || typeof record !== 'object') return null;
  return {
    ok: true,
    status: 'ready',
    reportId: record.reportId,
    reportType: record.reportType,
    disposition: record.disposition,
    partnerId: record.partnerId,
    sourceUseSite: record.sourceUseSite,
    sourceStateIdentity: record.sourceStateIdentity,
    versions: {
      rules: record.versions.rules,
      content: record.versions.content,
      state: record.versions.state,
    },
    authority: {
      verified: true,
      authorityId: PARTNER_REPORT_AUTHORITY_ID,
    },
  };
}

function generatedReport(runtime = {}) {
  const reportId = exactToken(runtime.reportId, 160)
    || `r-${crypto.randomUUID()}`;
  const now = Number(runtime.nowMs);
  const createdAtMs = Number.isSafeInteger(now) && now >= 0 ? now : Date.now();
  return { reportId, createdAtMs };
}

export async function submitStoredPartnerReport(storage, input, runtime = {}) {
  const normalized = normalizeSubmit(input);
  if (!normalized) return reject('report_request_invalid');
  const generated = generatedReport(runtime);
  const fingerprint = canonicalIdentity(normalized);

  return storage.transaction(async (txn) => {
    const idemKey = idempotencyStorageKey(normalized.idempotencyKey);
    const existingIdem = await txn.get(idemKey);
    if (existingIdem !== undefined) {
      if (existingIdem?.fingerprint !== fingerprint || !exactToken(existingIdem?.reportId, 160)) {
        return reject('report_idempotency_conflict');
      }
      const existingRecord = await txn.get(reportKey(existingIdem.reportId));
      if (!existingRecord) return reject('report_idempotency_state_invalid');
      return { ok: true, idempotent: true, report: publicReport(existingRecord) };
    }

    const recordKey = reportKey(generated.reportId);
    if (await txn.get(recordKey) !== undefined) return reject('report_generated_id_collision');

    const canonicalKey = canonicalStorageKey(normalized);
    const uniqueReportId = await txn.get(canonicalKey);
    const disposition = exactToken(uniqueReportId, 160) ? 'duplicate' : 'accepted_unique';
    const record = {
      schema: 'gameroad.partner-report.record.v1',
      reportId: generated.reportId,
      reportType: normalized.reportType,
      disposition,
      partnerId: normalized.partnerId,
      sourceUseSite: normalized.sourceUseSite,
      sourceStateIdentity: normalized.sourceStateIdentity,
      versions: normalized.versions,
      createdAtMs: generated.createdAtMs,
      authorityId: PARTNER_REPORT_AUTHORITY_ID,
    };

    txn.put(recordKey, record);
    txn.put(idemKey, { fingerprint, reportId: generated.reportId });
    if (disposition === 'accepted_unique') txn.put(canonicalKey, generated.reportId);

    return { ok: true, idempotent: false, report: publicReport(record) };
  });
}

export async function readStoredPartnerReport(storage, input) {
  const normalized = normalizeRead(input);
  if (!normalized) return reject('report_request_invalid');
  const record = await storage.get(reportKey(normalized.reportId));
  if (!record) return reject('report_not_found');
  const report = publicReport(record);
  if (!report) return reject('report_state_invalid');
  return { ok: true, report };
}

function reportJson(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function reportErrorStatus(reason) {
  if (reason === 'report_not_found') return 404;
  if (reason === 'report_idempotency_conflict') return 409;
  if (reason === 'report_generated_id_collision' || reason === 'report_idempotency_state_invalid' || reason === 'report_state_invalid') return 500;
  if (reason === 'report_request_too_large') return 413;
  return 400;
}

async function readReportJson(request) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) throw new Error('report_request_too_large');
  const text = await request.text();
  if (text.length > MAX_REQUEST_BYTES) throw new Error('report_request_too_large');
  try {
    return JSON.parse(text || '{}');
  } catch {
    throw new Error('report_request_invalid');
  }
}

export async function handlePartnerReportRequest(storage, request, url, runtime = {}) {
  if (request.method !== 'POST') return reportJson({ ok: false, reason: 'report_method_invalid' }, 405);
  const op = url.searchParams.get('reportOp') || '';
  if (op !== 'submit' && op !== 'read') return reportJson({ ok: false, reason: 'report_op_invalid' }, 404);

  let body;
  try {
    body = await readReportJson(request);
  } catch (error) {
    const reason = error?.message === 'report_request_too_large' ? 'report_request_too_large' : 'report_request_invalid';
    return reportJson({ ok: false, reason }, reportErrorStatus(reason));
  }

  if (op === 'submit') {
    const result = await submitStoredPartnerReport(storage, body, runtime);
    if (!result.ok) return reportJson({ ok: false, reason: result.reason }, reportErrorStatus(result.reason));
    return reportJson({ ...result.report, idempotent: result.idempotent });
  }

  const result = await readStoredPartnerReport(storage, body);
  if (!result.ok) return reportJson({ ok: false, reason: result.reason }, reportErrorStatus(result.reason));
  return reportJson(result.report);
}
