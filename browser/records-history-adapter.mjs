const SCHEMA = 'GAMEROAD_RECORDS_HISTORY_ADAPTER_V1';
const DEFAULT_SOURCE_ID = 'gameroad.browser.v10.core.1.history';

const MODE_LABELS = Object.freeze({
  '2p': '二人',
  '4p': '四人',
  '2v2': '二対二'
});

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function finiteInteger(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function cloneStringArray(value) {
  if (!Array.isArray(value) || value.some((id) => !nonEmptyString(id))) return null;
  return [...value];
}

function normalizeDeck(entry) {
  if (!entry?.deck || typeof entry.deck !== 'object' || Array.isArray(entry.deck)) return null;
  const main = cloneStringArray(entry.deck.main);
  if (!main) return null;
  const ex = entry.deck.ex == null ? null : cloneStringArray(entry.deck.ex);
  if (entry.deck.ex != null && !ex) return null;
  return { main, ex };
}

function formatOccurredAt(value) {
  if (!nonEmptyString(value)) return null;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return value;
  try {
    return new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(d);
  } catch (_) {
    return value;
  }
}

function recordIdFor(entry, index) {
  const base = nonEmptyString(entry?.at) ? entry.at : `legacy-${index + 1}`;
  return `match:${base}:${index}`;
}

export function adaptHistoryEntryToRecord(entry, index = 0, sourceId = DEFAULT_SOURCE_ID) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new TypeError('HISTORY_ENTRY_INVALID');
  if (!nonEmptyString(sourceId)) throw new TypeError('SOURCE_ID_INVALID');
  const mode = nonEmptyString(entry.mode) ? entry.mode : null;
  const rank = finiteInteger(entry.rank);
  const rounds = finiteInteger(entry.rounds);
  const deck = normalizeDeck(entry);
  const earned = finiteInteger(entry.battlePointsEarned);
  const quick = finiteInteger(entry.quickPoints);
  const after = finiteInteger(entry.battlePointsAfter);
  const titleParts = [mode ? (MODE_LABELS[mode] || mode.toUpperCase()) : '対戦'];
  if (rank != null) titleParts.push(`${rank}位`);
  const subtitle = rounds != null ? `${rounds}巡` : null;
  const details = {
    at: nonEmptyString(entry.at) ? entry.at : null,
    mode,
    rank,
    rounds,
    character: nonEmptyString(entry.character) ? entry.character : null,
    partner: nonEmptyString(entry.partner) ? entry.partner : null,
    battlePoints: earned == null && quick == null && after == null ? null : { earned, quick, after },
    deck
  };
  return {
    recordId: recordIdFor(entry, index),
    sourceId,
    title: titleParts.join(' / '),
    subtitle,
    statusLabel: rank === 1 ? '勝利' : (rank != null ? `${rank}位` : null),
    occurredAtLabel: formatOccurredAt(entry.at),
    details,
    actions: []
  };
}

export function adaptHistoryToRecords(history, options = {}) {
  if (!Array.isArray(history)) throw new TypeError('HISTORY_REQUIRED');
  const sourceId = nonEmptyString(options.sourceId) ? options.sourceId : DEFAULT_SOURCE_ID;
  return {
    schema: SCHEMA,
    sourceState: 'ready',
    sourceId,
    records: history.slice(0, 30).map((entry, index) => adaptHistoryEntryToRecord(entry, index, sourceId))
  };
}

export const RECORDS_HISTORY_ADAPTER = Object.freeze({
  schema: SCHEMA,
  defaultSourceId: DEFAULT_SOURCE_ID,
  modeLabels: MODE_LABELS
});
