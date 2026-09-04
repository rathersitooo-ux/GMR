import { storedMatchTicketStatus } from './match-store.mjs';

export const PARTNER_REPORT_AUTHORITY_ID = 'gameroad.partner-report.authority.v1';
export const PARTNER_REPORT_RECORD_PREFIX = 'partner-report/report/';
export const PARTNER_REPORT_IDEMPOTENCY_PREFIX = 'partner-report/idempotency/';
export const PARTNER_REPORT_CANONICAL_PREFIX = 'partner-report/canonical/';
export const BATTLE_RECEIPT_AUTHORITY_ID = 'gameroad.match-participant-receipt.v1';
export const BATTLE_RECEIPT_SOURCE_SCHEMA = 'GAMEROAD_BATTLE_REPLAY_V1';
export const BATTLE_RECEIPT_RECORD_PREFIX = 'battle-receipt/event/';
export const BATTLE_RECEIPT_META_PREFIX = 'battle-receipt/meta/';

const REPORT_TYPES = new Set(['bug', 'defect', 'request']);
const VERSION_KEYS = Object.freeze(['rules', 'content', 'state']);
const MAX_REQUEST_BYTES = 4096;
const DIALOGUE_FEEDBACK_KIND = 'dialogue_edit';
const BATTLE_RECEIPT_KINDS = new Set(['battle_resolution', 'match_ended']);
const BATTLE_RECEIPT_MAX_REQUEST_BYTES = 16_384;
const BATTLE_RECEIPT_MAX_EVENTS = 512;
const BATTLE_RECEIPT_MAX_PLAYERS = 4;
const BATTLE_RECEIPT_MAX_CARDS = 16;

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

function battleReceiptKey(matchId, sequence) {
  return `${BATTLE_RECEIPT_RECORD_PREFIX}${enc(matchId)}/${String(sequence).padStart(6, '0')}`;
}

function battleReceiptMetaKey(matchId) {
  return `${BATTLE_RECEIPT_META_PREFIX}${enc(matchId)}`;
}

function safeInteger(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  return Number.isSafeInteger(value) && value >= min && value <= max ? value : null;
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function sameVersions(left, right) {
  return VERSION_KEYS.every((key) => left?.[key] === right?.[key]);
}

function safeUniqueTokens(value, maxCount = BATTLE_RECEIPT_MAX_PLAYERS) {
  if (!Array.isArray(value) || value.length > maxCount) return null;
  const rows = value.map((entry) => exactToken(entry, 160));
  if (rows.some((entry) => !entry) || new Set(rows).size !== rows.length) return null;
  return rows;
}

function sanitizeBattleCards(value) {
  if (!Array.isArray(value) || value.length > BATTLE_RECEIPT_MAX_CARDS) return null;
  const rows = [];
  for (const card of value) {
    if (!card || typeof card !== 'object' || Array.isArray(card)) return null;
    const cardId = exactToken(card.cardId, 160);
    const cardValue = finiteNumber(card.value);
    if (!cardId || cardValue === null) return null;
    rows.push({ cardId, value: cardValue });
  }
  return rows;
}

function sanitizeBattlePlayers(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > BATTLE_RECEIPT_MAX_PLAYERS) return null;
  const rows = [];
  for (const player of value) {
    if (!player || typeof player !== 'object' || Array.isArray(player)) return null;
    const id = exactToken(player.id, 160);
    const score = finiteNumber(player.score);
    const cards = sanitizeBattleCards(player.cards);
    if (!id || score === null || !cards) return null;
    const row = { id, score, winner: player.winner === true, cards };
    if (player.team != null) {
      const team = exactToken(player.team, 32);
      if (!team) return null;
      row.team = team;
    }
    rows.push(row);
  }
  if (new Set(rows.map((row) => row.id)).size !== rows.length) return null;
  return rows;
}

function sanitizeLaneGains(value) {
  if (!Array.isArray(value) || value.length > BATTLE_RECEIPT_MAX_PLAYERS) return null;
  const rows = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const id = exactToken(item.id, 160);
    const lane = exactToken(item.lane, 64);
    const before = safeInteger(item.before);
    const after = safeInteger(item.after);
    const added = safeInteger(item.added);
    if (!id || !lane || before === null || after === null || added === null) return null;
    rows.push({ id, lane, before, after, added });
  }
  return rows;
}

function sanitizeMaxLaneProgress(value) {
  if (!Array.isArray(value) || value.length > BATTLE_RECEIPT_MAX_PLAYERS) return null;
  const rows = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const id = exactToken(item.id, 160);
    const before = safeInteger(item.before);
    const after = safeInteger(item.after);
    if (!id || before === null || after === null) return null;
    rows.push({ id, before, after });
  }
  return rows;
}

function sanitizeTeamTotals(value) {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const A = finiteNumber(value.A);
  const B = finiteNumber(value.B);
  if (A === null || B === null) return false;
  return { A, B };
}

function sanitizeFormalRanking(value) {
  if (value == null) return null;
  if (!Array.isArray(value) || value.length !== BATTLE_RECEIPT_MAX_PLAYERS) return false;
  const rows = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    const id = exactToken(item.id, 160);
    const rank = safeInteger(item.rank, 1, BATTLE_RECEIPT_MAX_PLAYERS);
    const maxColumn = safeInteger(item.maxColumn);
    if (!id || rank === null || maxColumn === null) return false;
    rows.push({ id, rank, maxColumn });
  }
  return new Set(rows.map((row) => row.id)).size === rows.length ? rows : false;
}

function sanitizeBattleResolution(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const serial = safeInteger(value.serial, 1);
  const round = safeInteger(value.round, 1);
  const mode = exactToken(value.mode, 32);
  const attackerId = exactToken(value.attackerId, 160);
  const defenderId = exactToken(value.defenderId, 160);
  const lane = exactToken(value.lane, 64);
  const winnerIds = safeUniqueTokens(value.winnerIds);
  const players = sanitizeBattlePlayers(value.players);
  const laneGains = sanitizeLaneGains(value.laneGains);
  const maxLaneProgress = sanitizeMaxLaneProgress(value.maxLaneProgress);
  const teamTotals = sanitizeTeamTotals(value.teamTotals);
  if (serial === null || round === null || !mode || !attackerId || !defenderId || !lane ||
      !winnerIds || !players || !laneGains || !maxLaneProgress || teamTotals === false) return null;
  const out = { serial, round, mode, attackerId, defenderId, lane, winnerIds, players, laneGains, maxLaneProgress };
  if (value.shield != null) {
    const shield = exactToken(value.shield, 160);
    if (!shield) return null;
    out.shield = shield;
  }
  if (value.winningTeam != null) {
    const winningTeam = exactToken(value.winningTeam, 32);
    if (!winningTeam) return null;
    out.winningTeam = winningTeam;
  }
  if (teamTotals !== null) out.teamTotals = teamTotals;
  return out;
}

function sanitizeMatchEnded(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const round = safeInteger(value.round, 1);
  const mode = exactToken(value.mode, 32);
  const winnerIds = safeUniqueTokens(value.winnerIds);
  const formalRanking = sanitizeFormalRanking(value.formalRanking);
  if (round === null || !mode || !winnerIds || formalRanking === false) return null;
  const out = { round, mode, winnerIds };
  if (formalRanking !== null) out.formalRanking = formalRanking;
  return out;
}

function canonicalJson(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return JSON.stringify(value);
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  throw new TypeError('battle_receipt_non_json');
}

function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function normalizeBattleReceiptSubmit(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const ticketId = exactToken(input.ticketId, 160);
  const secret = exactToken(input.secret, 256);
  const sourceSchema = exactToken(input.sourceSchema, 96);
  const matchId = exactToken(input.matchId, 160);
  const sequence = safeInteger(input.sequence, 1, BATTLE_RECEIPT_MAX_EVENTS);
  const kind = exactToken(input.kind, 64);
  const versions = safeVersions(input.versions);
  if (!ticketId || !secret || sourceSchema !== BATTLE_RECEIPT_SOURCE_SCHEMA || !matchId || sequence === null ||
      !kind || !BATTLE_RECEIPT_KINDS.has(kind) || !versions) return null;
  const publicData = kind === 'battle_resolution'
    ? sanitizeBattleResolution(input.publicData)
    : sanitizeMatchEnded(input.publicData);
  if (!publicData) return null;
  const event = { sourceSchema, matchId, sequence, kind, versions, publicData };
  return { ticketId, secret, event, fingerprint: fnv1a(canonicalJson(event)) };
}

function battleReporterSlot(status) {
  const ticketId = status?.ticket?.ticketId;
  const seats = status?.match?.seats;
  if (Array.isArray(seats)) {
    const seat = seats.find((candidate) => candidate?.kind === 'HUMAN' && candidate.ticketId === ticketId);
    if (seat && Number.isInteger(seat.slot) && seat.slot >= 0 && seat.slot < BATTLE_RECEIPT_MAX_PLAYERS) return seat.slot;
  }
  const fallback = status?.match?.ticketIds?.indexOf(ticketId);
  return Number.isInteger(fallback) && fallback >= 0 && fallback < BATTLE_RECEIPT_MAX_PLAYERS ? fallback : null;
}

function publicBattleReceipt(record, idempotent = false) {
  return {
    ok: true,
    idempotent,
    schema: record.schema,
    sourceSchema: record.sourceSchema,
    matchId: record.matchId,
    sequence: record.sequence,
    kind: record.kind,
    versions: structuredClone(record.versions),
    fingerprint: record.fingerprint,
    reporterSlot: record.reporterSlot,
    receiptAuthority: {
      verified: true,
      authorityId: BATTLE_RECEIPT_AUTHORITY_ID,
      scope: 'authenticated_match_participant_receipt',
      gameplayAuthoritative: false,
    },
  };
}

export async function submitStoredBattleReceipt(storage, input, runtime = {}) {
  const normalized = normalizeBattleReceiptSubmit(input);
  if (!normalized) return reject('battle_receipt_request_invalid');
  const now = Number(runtime.nowMs);
  const nowMs = Number.isSafeInteger(now) && now >= 0 ? now : Date.now();
  const status = await storedMatchTicketStatus(storage, {
    ticketId: normalized.ticketId,
    secret: normalized.secret,
  }, { nowMs, generatedMatchId: '' });
  if (!status.ok) return reject('battle_receipt_auth_invalid');
  if (!status.match || status.ticket?.matchId !== normalized.event.matchId || status.match.matchId !== normalized.event.matchId) {
    return reject('battle_receipt_match_invalid');
  }
  const reporterSlot = battleReporterSlot(status);
  if (reporterSlot === null) return reject('battle_receipt_reporter_invalid');

  return storage.transaction(async (txn) => {
    const metaKey = battleReceiptMetaKey(normalized.event.matchId);
    const prior = await txn.get(metaKey);
    const meta = prior && typeof prior === 'object' && prior.schema === 'gameroad.battle-receipt.meta.v1'
      ? prior
      : {
          schema: 'gameroad.battle-receipt.meta.v1',
          matchId: normalized.event.matchId,
          versions: normalized.event.versions,
          nextSequence: 1,
          terminal: false,
        };
    if (meta.matchId !== normalized.event.matchId || !sameVersions(meta.versions, normalized.event.versions)) {
      return reject('battle_receipt_version_conflict');
    }
    if (!Number.isSafeInteger(meta.nextSequence) || meta.nextSequence < 1 || meta.nextSequence > BATTLE_RECEIPT_MAX_EVENTS + 1) {
      return reject('battle_receipt_state_invalid');
    }

    const eventKey = battleReceiptKey(normalized.event.matchId, normalized.event.sequence);
    if (normalized.event.sequence < meta.nextSequence) {
      const existing = await txn.get(eventKey);
      if (!existing || existing.fingerprint !== normalized.fingerprint) return reject('battle_receipt_sequence_conflict');
      return publicBattleReceipt(existing, true);
    }
    if (normalized.event.sequence > meta.nextSequence) return reject('battle_receipt_sequence_gap');
    if (meta.terminal === true) return reject('battle_receipt_terminal');

    const record = {
      schema: 'gameroad.battle-receipt.event.v1',
      sourceSchema: normalized.event.sourceSchema,
      matchId: normalized.event.matchId,
      sequence: normalized.event.sequence,
      kind: normalized.event.kind,
      versions: normalized.event.versions,
      publicData: normalized.event.publicData,
      fingerprint: normalized.fingerprint,
      reporterSlot,
      receivedAtMs: nowMs,
      authorityId: BATTLE_RECEIPT_AUTHORITY_ID,
    };
    txn.put(eventKey, record);
    txn.put(metaKey, {
      ...meta,
      nextSequence: normalized.event.sequence + 1,
      terminal: normalized.event.kind === 'match_ended',
    });
    return publicBattleReceipt(record, false);
  });
}

export async function readStoredBattleReceipt(storage, input) {
  const matchId = exactToken(input?.matchId, 160);
  const sequence = safeInteger(input?.sequence, 1, BATTLE_RECEIPT_MAX_EVENTS);
  if (!matchId || sequence === null) return reject('battle_receipt_request_invalid');
  const record = await storage.get(battleReceiptKey(matchId, sequence));
  if (!record || record.schema !== 'gameroad.battle-receipt.event.v1') return reject('battle_receipt_not_found');
  return {
    ok: true,
    record: {
      schema: record.schema,
      sourceSchema: record.sourceSchema,
      matchId: record.matchId,
      sequence: record.sequence,
      kind: record.kind,
      versions: structuredClone(record.versions),
      publicData: structuredClone(record.publicData),
      fingerprint: record.fingerprint,
      reporterSlot: record.reporterSlot,
      receivedAtMs: record.receivedAtMs,
      receiptAuthority: {
        verified: true,
        authorityId: BATTLE_RECEIPT_AUTHORITY_ID,
        scope: 'authenticated_match_participant_receipt',
        gameplayAuthoritative: false,
      },
    },
  };
}

function battleReceiptErrorStatus(reason) {
  if (reason === 'battle_receipt_auth_invalid' || reason === 'battle_receipt_match_invalid' || reason === 'battle_receipt_reporter_invalid') return 403;
  if (reason === 'battle_receipt_sequence_conflict' || reason === 'battle_receipt_sequence_gap' ||
      reason === 'battle_receipt_version_conflict' || reason === 'battle_receipt_terminal') return 409;
  if (reason === 'battle_receipt_request_too_large') return 413;
  if (reason === 'battle_receipt_state_invalid') return 500;
  return 400;
}

async function readBattleReceiptJson(request) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > BATTLE_RECEIPT_MAX_REQUEST_BYTES) {
    throw new Error('battle_receipt_request_too_large');
  }
  const text = await request.text();
  if (text.length > BATTLE_RECEIPT_MAX_REQUEST_BYTES) throw new Error('battle_receipt_request_too_large');
  try {
    return JSON.parse(text || '{}');
  } catch {
    throw new Error('battle_receipt_request_invalid');
  }
}

export async function handleBattleReceiptRequest(storage, request, url, runtime = {}) {
  if (request.method !== 'POST') return reportJson({ ok: false, reason: 'battle_receipt_method_invalid' }, 405);
  if ((url.searchParams.get('battleEventOp') || '') !== 'submit') {
    return reportJson({ ok: false, reason: 'battle_receipt_op_invalid' }, 404);
  }
  let body;
  try {
    body = await readBattleReceiptJson(request);
  } catch (error) {
    const reason = error?.message === 'battle_receipt_request_too_large'
      ? 'battle_receipt_request_too_large'
      : 'battle_receipt_request_invalid';
    return reportJson({ ok: false, reason }, battleReceiptErrorStatus(reason));
  }
  const result = await submitStoredBattleReceipt(storage, body, runtime);
  if (!result.ok) return reportJson(result, battleReceiptErrorStatus(result.reason));
  return reportJson(result);
}
