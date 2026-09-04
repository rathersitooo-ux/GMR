export const PARTNER_REPORT_AUTHORITY_ID = 'gameroad.partner-report.authority.v1';
export const PARTNER_REPORT_RECORD_PREFIX = 'partner-report/report/';
export const PARTNER_REPORT_IDEMPOTENCY_PREFIX = 'partner-report/idempotency/';
export const PARTNER_REPORT_CANONICAL_PREFIX = 'partner-report/canonical/';

const REPORT_TYPES = new Set(['bug', 'defect', 'request']);
const VERSION_KEYS = Object.freeze(['rules', 'content', 'state']);
const MAX_REQUEST_BYTES = 4096;
const DIALOGUE_FEEDBACK_KIND = 'dialogue_edit';

function reject(reason) {
  return { ok: false, reason };
}

function exactToken(value, max = 192) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text !== value || text.length > max || /[\u0000-\u001f\u007f]/.test(text)) return null;
  return text;
}

function boundedText(value, max = 600) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) return null;
  return text;
}

function boundedNumber(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
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

function normalizeVoiceTuning(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const rate = boundedNumber(value.rate, 0.5, 2);
  const pitch = boundedNumber(value.pitch, 0, 2);
  const volume = boundedNumber(value.volume, 0, 1);
  const pauseMs = boundedNumber(value.pauseMs, 0, 1000);
  const voiceURI = value.voiceURI === '' ? '' : exactToken(value.voiceURI, 240);
  if (rate === null || pitch === null || volume === null || pauseMs === null || voiceURI === null) return null;
  return { rate, pitch, volume, pauseMs: Math.round(pauseMs), voiceURI };
}

function normalizeFeedback(value, reportType) {
  if (value === undefined) return null;
  if (reportType !== 'request' || !value || typeof value !== 'object' || Array.isArray(value)) return false;
  const kind = exactToken(value.kind, 64);
  const sourceLineId = exactToken(value.sourceLineId, 160);
  const proposedText = boundedText(value.proposedText, 600);
  const voiceTuning = normalizeVoiceTuning(value.voiceTuning);
  if (
    kind !== DIALOGUE_FEEDBACK_KIND
    || !sourceLineId
    || !proposedText
    || !voiceTuning
    || value.candidateOnly !== true
    || value.canonicalWrite !== false
    || value.chatgptOpinionInput !== true
  ) return false;
  return {
    kind,
    sourceLineId,
    proposedText,
    voiceTuning,
    candidateOnly: true,
    canonicalWrite: false,
    chatgptOpinionInput: true,
  };
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
  const feedback = normalizeFeedback(input.feedback, reportType);
  if (feedback === false) return null;
  return { idempotencyKey, partnerId, reportType, sourceUseSite, sourceStateIdentity, versions, ...(feedback ? { feedback } : {}) };
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
  const base = [
    input.partnerId,
    input.reportType,
    input.sourceUseSite,
    input.sourceStateIdentity,
    input.versions.rules,
    input.versions.content,
    input.versions.state,
  ];
  if (input.feedback) {
    base.push(
      input.feedback.kind,
      input.feedback.sourceLineId,
      input.feedback.proposedText,
      String(input.feedback.voiceTuning.rate),
      String(input.feedback.voiceTuning.pitch),
      String(input.feedback.voiceTuning.volume),
      String(input.feedback.voiceTuning.pauseMs),
      input.feedback.voiceTuning.voiceURI,
    );
  }
  return base.join('\u001f');
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
    ...(record.feedback ? { feedback: structuredClone(record.feedback) } : {}),
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
      schema: normalized.feedback ? 'gameroad.partner-report.record.v2' : 'gameroad.partner-report.record.v1',
      reportId: generated.reportId,
      reportType: normalized.reportType,
      disposition,
      partnerId: normalized.partnerId,
      sourceUseSite: normalized.sourceUseSite,
      sourceStateIdentity: normalized.sourceStateIdentity,
      versions: normalized.versions,
      ...(normalized.feedback ? { feedback: normalized.feedback } : {}),
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
