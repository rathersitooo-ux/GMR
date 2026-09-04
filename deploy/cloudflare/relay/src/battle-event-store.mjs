import { storedMatchTicketStatus } from './match-store.mjs';

export const BATTLE_EVENT_STORAGE_SCHEMA = 'gameroad.battle-event.storage.v1';
export const BATTLE_EVENT_SOURCE_SCHEMA = 'GAMEROAD_BATTLE_REPLAY_V1';
export const BATTLE_EVENT_META_PREFIX = 'battle/event-meta/';
export const BATTLE_EVENT_RECORD_PREFIX = 'battle/event-record/';
export const BATTLE_EVENT_RECEIPT_AUTHORITY = 'gameroad.match-participant-receipt.v1';

const VERSION_KEYS = Object.freeze(['rules', 'content', 'state']);
const ACCEPTED_KINDS = new Set(['battle_resolution', 'match_ended']);
const MAX_EVENTS_PER_MATCH = 512;
const MAX_PLAYERS = 4;
const MAX_CARDS_PER_PLAYER = 16;
const CONTROL_RE = /[\u0000-\u001f\u007f]/;

function enc(value) { return encodeURIComponent(String(value)); }
function metaKey(matchId) { return `${BATTLE_EVENT_META_PREFIX}${enc(matchId)}`; }
function recordKey(matchId, sequence) {
  return `${BATTLE_EVENT_RECORD_PREFIX}${enc(matchId)}/${String(sequence).padStart(6, '0')}`;
}
function reject(reason) { return { ok: false, reason }; }
function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function own(value, key) { return Object.prototype.hasOwnProperty.call(value, key); }

function boundedText(value, max = 160) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > max || CONTROL_RE.test(text)) return null;
  return text;
}

function safeInteger(value, minimum = 0) {
  return Number.isSafeInteger(value) && value >= minimum ? value : null;
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function exactKeys(value, keys) {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function normalizeVersions(value) {
  if (!exactKeys(value, VERSION_KEYS)) return null;
  const out = {};
  for (const key of VERSION_KEYS) {
    const text = boundedText(value[key], 192);
    if (!text) return null;
    out[key] = text;
  }
  return out;
}

function sameVersions(left, right) {
  return VERSION_KEYS.every((key) => left?.[key] === right?.[key]);
}

function normalizeStringArray(value, max = MAX_PLAYERS) {
  if (!Array.isArray(value) || value.length > max) return null;
  const out = value.map((item) => boundedText(item));
  if (out.some((item) => item === null) || new Set(out).size !== out.length) return null;
  return out;
}

function normalizeCards(value) {
  if (!Array.isArray(value) || value.length > MAX_CARDS_PER_PLAYER) return null;
  const out = [];
  for (const card of value) {
    if (!isRecord(card)) return null;
    const cardId = boundedText(card.cardId);
    const number = finiteNumber(card.value);
    if (!cardId || number === null) return null;
    out.push({ cardId, value: number });
  }
  return out;
}

function normalizePlayers(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_PLAYERS) return null;
  const out = [];
  for (const player of value) {
    if (!isRecord(player)) return null;
    const id = boundedText(player.id);
    const score = finiteNumber(player.score);
    const cards = normalizeCards(player.cards);
    if (!id || score === null || !cards) return null;
    const row = { id, score, winner: player.winner === true, cards };
    if (player.team != null) {
      const team = boundedText(player.team, 32);
      if (!team) return null;
      row.team = team;
    }
    out.push(row);
  }
  if (new Set(out.map((row) => row.id)).size !== out.length) return null;
  return out;
}

function normalizeLaneGains(value) {
  if (!Array.isArray(value) || value.length > MAX_PLAYERS) return null;
  const out = [];
  for (const row of value) {
    if (!isRecord(row)) return null;
    const id = boundedText(row.id);
    const lane = boundedText(row.lane, 64);
    const before = safeInteger(row.before);
    const after = safeInteger(row.after);
    const added = safeInteger(row.added);
    if (!id || !lane || before === null || after === null || added === null) return null;
    out.push({ id, lane, before, after, added });
  }
  return out;
}

function normalizeMaxLaneProgress(value) {
  if (!Array.isArray(value) || value.length > MAX_PLAYERS) return null;
  const out = [];
  for (const row of value) {
    if (!isRecord(row)) return null;
    const id = boundedText(row.id);
    const before = safeInteger(row.before);
    const after = safeInteger(row.after);
    if (!id || before === null || after === null) return null;
    out.push({ id, before, after });
  }
  return out;
}

function normalizeTeamTotals(value) {
  if (value == null) return null;
  if (!exactKeys(value, ['A', 'B'])) return undefined;
  const A = finiteNumber(value.A);
  const B = finiteNumber(value.B);
  return A === null || B === null ? undefined : { A, B };
}

function normalizeFormalRanking(value) {
  if (value == null) return null;
  if (!Array.isArray(value) || value.length !== MAX_PLAYERS) return undefined;
  const out = [];
  for (const row of value) {
    if (!isRecord(row)) return undefined;
    const id = boundedText(row.id);
    const rank = safeInteger(row.rank, 1);
    const maxColumn = safeInteger(row.maxColumn);
    if (!id || rank === null || maxColumn === null) return undefined;
    out.push({ id, rank, maxColumn });
  }
  if (new Set(out.map((row) => row.id)).size !== out.length) return undefined;
  return out;
}

function normalizeBattleResolution(value) {
  if (!isRecord(value)) return null;
  const serial = safeInteger(value.serial, 1);
  const round = safeInteger(value.round, 1);
  const mode = boundedText(value.mode, 32);
  const attackerId = boundedText(value.attackerId);
  const defenderId = boundedText(value.defenderId);
  const lane = boundedText(value.lane, 64);
  const winnerIds = normalizeStringArray(value.winnerIds);
  const players = normalizePlayers(value.players);
  const laneGains = normalizeLaneGains(value.laneGains);
  const maxLaneProgress = normalizeMaxLaneProgress(value.maxLaneProgress);
  const teamTotals = normalizeTeamTotals(value.teamTotals);
  if (serial === null || round === null || !mode || !attackerId || !defenderId || !lane ||
      !winnerIds || !players || !laneGains || !maxLaneProgress || teamTotals === undefined) return null;

  const out = {
    serial,
    round,
    mode,
    attackerId,
    defenderId,
    lane,
    winnerIds,
    players,
    laneGains,
    maxLaneProgress,
  };
  if (value.shield != null) {
    const shield = boundedText(value.shield);
    if (!shield) return null;
    out.shield = shield;
  }
  if (value.winningTeam != null) {
    const winningTeam = boundedText(value.winningTeam, 32);
    if (!winningTeam) return null;
    out.winningTeam = winningTeam;
  }
  if (teamTotals !== null) out.teamTotals = teamTotals;
  return out;
}

function normalizeMatchEnded(value) {
  if (!isRecord(value)) return null;
  const round = safeInteger(value.round, 1);
  const mode = boundedText(value.mode, 32);
  const winnerIds = normalizeStringArray(value.winnerIds);
  const formalRanking = normalizeFormalRanking(value.formalRanking);
  if (round === null || !mode || !winnerIds || formalRanking === undefined) return null;
  const out = { round, mode, winnerIds };
  if (formalRanking !== null) out.formalRanking = formalRanking;
  return out;
}

function normalizePublicData(kind, value) {
  if (kind === 'battle_resolution') return normalizeBattleResolution(value);
  if (kind === 'match_ended') return normalizeMatchEnded(value);
  return null;
}

function canonicalJson(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return JSON.stringify(value);
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  throw new TypeError('battle_event_non_json_value');
}

function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function normalizeSubmission(input) {
  if (!isRecord(input)) return null;
  const ticketId = boundedText(input.ticketId);
  const secret = boundedText(input.secret, 256);
  const sourceSchema = boundedText(input.sourceSchema, 64);
  const matchId = boundedText(input.matchId);
  const sequence = safeInteger(input.sequence, 1);
  const kind = boundedText(input.kind, 64);
  const versions = normalizeVersions(input.versions);
  if (!ticketId || !secret || sourceSchema !== BATTLE_EVENT_SOURCE_SCHEMA || !matchId || sequence === null ||
      sequence > MAX_EVENTS_PER_MATCH || !kind || !ACCEPTED_KINDS.has(kind) || !versions) return null;
  const publicData = normalizePublicData(kind, input.publicData);
  if (!publicData) return null;
  const event = { sourceSchema, matchId, sequence, kind, versions, publicData };
  return { ticketId, secret, event, fingerprint: fnv1a(canonicalJson(event)) };
}

function reporterSlot(status) {
  const ticketId = status?.ticket?.ticketId;
  const seats = status?.match?.seats;
  if (Array.isArray(seats)) {
    const seat = seats.find((candidate) => candidate?.kind === 'HUMAN' && candidate.ticketId === ticketId);
    if (seat && Number.isInteger(seat.slot) && seat.slot >= 0 && seat.slot < MAX_PLAYERS) return seat.slot;
  }
  const fallback = status?.match?.ticketIds?.indexOf(ticketId);
  return Number.isInteger(fallback) && fallback >= 0 && fallback < MAX_PLAYERS ? fallback : null;
}

function publicReceipt(record, { idempotent = false } = {}) {
  return {
    ok: true,
    idempotent,
    schema: record.schema,
    sourceSchema: record.sourceSchema,
    matchId: record.matchId,
    sequence: record.sequence,
    kind: record.kind,
    versions: { ...record.versions },
    fingerprint: record.fingerprint,
    receiptAuthority: {
      verified: true,
      authorityId: BATTLE_EVENT_RECEIPT_AUTHORITY,
      scope: 'authenticated_match_participant_receipt',
      gameplayAuthoritative: false,
    },
    reporterSlot: record.reporterSlot,
  };
}

export async function submitStoredBattleEvent(storage, input, runtime = {}) {
  const normalized = normalizeSubmission(input);
  if (!normalized) return reject('battle_event_request_invalid');

  const status = await storedMatchTicketStatus(storage, {
    ticketId: normalized.ticketId,
    secret: normalized.secret,
  }, {
    nowMs: Number.isSafeInteger(runtime.nowMs) ? runtime.nowMs : Date.now(),
    generatedMatchId: '',
  });
  if (!status.ok) return reject('battle_event_auth_invalid');
  if (!status.match || status.ticket?.matchId !== normalized.event.matchId || status.match.matchId !== normalized.event.matchId) {
    return reject('battle_event_match_invalid');
  }
  const slot = reporterSlot(status);
  if (slot === null) return reject('battle_event_reporter_invalid');

  return storage.transaction(async (txn) => {
    const key = metaKey(normalized.event.matchId);
    const prior = await txn.get(key);
    const meta = isRecord(prior) && prior.schema === BATTLE_EVENT_STORAGE_SCHEMA
      ? prior
      : {
          schema: BATTLE_EVENT_STORAGE_SCHEMA,
          matchId: normalized.event.matchId,
          versions: normalized.event.versions,
          nextSequence: 1,
          terminal: false,
          serverMatch: {
            format: boundedText(status.match.format, 32) || 'unknown',
            ruleset: isRecord(status.match.ruleset) ? { ...status.match.ruleset } : null,
          },
        };

    if (meta.matchId !== normalized.event.matchId || !sameVersions(meta.versions, normalized.event.versions)) {
      return reject('battle_event_version_conflict');
    }
    if (!Number.isSafeInteger(meta.nextSequence) || meta.nextSequence < 1 || meta.nextSequence > MAX_EVENTS_PER_MATCH + 1) {
      return reject('battle_event_storage_invalid');
    }

    const eventKey = recordKey(normalized.event.matchId, normalized.event.sequence);
    if (normalized.event.sequence < meta.nextSequence) {
      const existing = await txn.get(eventKey);
      if (!isRecord(existing) || existing.fingerprint !== normalized.fingerprint) {
        return reject('battle_event_sequence_conflict');
      }
      return publicReceipt(existing, { idempotent: true });
    }
    if (normalized.event.sequence > meta.nextSequence) return reject('battle_event_sequence_gap');
    if (meta.terminal === true) return reject('battle_event_terminal');

    const record = {
      schema: BATTLE_EVENT_STORAGE_SCHEMA,
      sourceSchema: normalized.event.sourceSchema,
      matchId: normalized.event.matchId,
      sequence: normalized.event.sequence,
      kind: normalized.event.kind,
      versions: normalized.event.versions,
      publicData: normalized.event.publicData,
      fingerprint: normalized.fingerprint,
      reporterSlot: slot,
      receivedAtMs: Number.isSafeInteger(runtime.nowMs) ? runtime.nowMs : Date.now(),
      receiptAuthority: BATTLE_EVENT_RECEIPT_AUTHORITY,
    };
    txn.put(eventKey, record);
    txn.put(key, {
      ...meta,
      nextSequence: normalized.event.sequence + 1,
      terminal: normalized.event.kind === 'match_ended',
    });
    return publicReceipt(record);
  });
}

export async function readStoredBattleEvent(storage, { matchId, sequence } = {}) {
  const safeMatchId = boundedText(matchId);
  const safeSequence = safeInteger(sequence, 1);
  if (!safeMatchId || safeSequence === null) return reject('battle_event_read_invalid');
  const record = await storage.get(recordKey(safeMatchId, safeSequence));
  if (!isRecord(record) || record.schema !== BATTLE_EVENT_STORAGE_SCHEMA) return reject('battle_event_not_found');
  return {
    ok: true,
    record: {
      schema: record.schema,
      sourceSchema: record.sourceSchema,
      matchId: record.matchId,
      sequence: record.sequence,
      kind: record.kind,
      versions: { ...record.versions },
      publicData: structuredClone(record.publicData),
      fingerprint: record.fingerprint,
      reporterSlot: record.reporterSlot,
      receivedAtMs: record.receivedAtMs,
      receiptAuthority: {
        verified: true,
        authorityId: BATTLE_EVENT_RECEIPT_AUTHORITY,
        scope: 'authenticated_match_participant_receipt',
        gameplayAuthoritative: false,
      },
    },
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function errorStatus(reason) {
  if (reason === 'battle_event_auth_invalid') return 403;
  if (reason === 'battle_event_match_invalid' || reason === 'battle_event_reporter_invalid') return 403;
  if (reason === 'battle_event_sequence_gap' || reason === 'battle_event_sequence_conflict' ||
      reason === 'battle_event_version_conflict' || reason === 'battle_event_terminal') return 409;
  return 400;
}

async function readJson(request) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > 16384) throw new Error('battle_event_request_too_large');
  const text = await request.text();
  if (text.length > 16384) throw new Error('battle_event_request_too_large');
  return JSON.parse(text || '{}');
}

export async function handleBattleEventRequest(storage, request, url, runtime = {}) {
  if (request.method !== 'POST') return json({ ok: false, reason: 'battle_event_method_invalid' }, 405);
  if ((url.searchParams.get('battleEventOp') || '') !== 'submit') {
    return json({ ok: false, reason: 'battle_event_op_invalid' }, 404);
  }
  let body;
  try { body = await readJson(request); }
  catch { return json({ ok: false, reason: 'battle_event_request_invalid' }, 400); }
  const result = await submitStoredBattleEvent(storage, body, runtime);
  if (!result.ok) return json(result, errorStatus(result.reason));
  return json(result);
}
