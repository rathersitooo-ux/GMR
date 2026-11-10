// 対局ログ（リプレイ）の端末への保存の受け口。
// F1-047 の受入条件の確認（2026-11-10 23:40回）で「ない」と分かった分：
// 版つき記録・見る人の境界・勝ちのつなぎ・再戦は写しにあるが、
// リプレイの保存・残し方はメモリ内だけで、端末への保存は adapter・core の
// どちらにもなかった。この受け口がその保存の側を受け持つ。
// 保存するのは自分の端末の中だけ（localStorage 相当の storage）。
// 見る人の境界は保存では変えず、読み出した記録は readReplay で
// 見る人ごとに分けて出す決まりのまま。
import { validateReplayLog } from './battle-replay-core.mjs';

export const REPLAY_PERSISTENCE_SCHEMA = 'gameroad.replay.persistence.v1';
export const REPLAY_INDEX_KEY = 'gameroad.replay.index.v1';
export const REPLAY_MAX_SAVED_DEFAULT = 10;

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function cloneJson(value) {
  if (value === undefined) return undefined;
  const text = JSON.stringify(value);
  if (text === undefined) throw new TypeError('NON_JSON_VALUE');
  return JSON.parse(text);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function hasStorageShape(storage) {
  return storage
    && typeof storage.getItem === 'function'
    && typeof storage.setItem === 'function'
    && typeof storage.removeItem === 'function';
}

function replayKey(matchId) {
  return `gameroad.replay.v1.${encodeURIComponent(matchId)}`;
}

function normalizeIndexEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  if (!nonEmptyString(entry.matchId)) return null;
  if (!Number.isSafeInteger(entry.savedAt) || entry.savedAt < 0) return null;
  if (!Number.isSafeInteger(entry.eventCount) || entry.eventCount < 0) return null;
  if (!entry.versions || typeof entry.versions !== 'object') return null;
  for (const key of ['rules', 'content', 'state']) {
    if (!nonEmptyString(entry.versions[key])) return null;
  }
  return deepFreeze({
    matchId: entry.matchId,
    savedAt: entry.savedAt,
    eventCount: entry.eventCount,
    versions: {
      rules: entry.versions.rules,
      content: entry.versions.content,
      state: entry.versions.state
    }
  });
}

function readIndex(storage) {
  let raw;
  try {
    raw = storage.getItem(REPLAY_INDEX_KEY);
  } catch {
    return { ok: false, reason: 'INDEX_READ_FAILED', entries: [] };
  }
  if (raw == null) return { ok: true, entries: [] };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: true, reason: 'INDEX_REBUILT', entries: [] };
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.entries)) {
    return { ok: true, reason: 'INDEX_REBUILT', entries: [] };
  }
  const entries = [];
  for (const entry of parsed.entries) {
    const normalized = normalizeIndexEntry(entry);
    if (normalized) entries.push(normalized);
  }
  return { ok: true, entries };
}

function writeIndex(storage, entries) {
  const serialized = JSON.stringify({ schema: REPLAY_PERSISTENCE_SCHEMA, entries });
  storage.setItem(REPLAY_INDEX_KEY, serialized);
  return storage.getItem(REPLAY_INDEX_KEY) === serialized;
}

export function saveReplayLog(storage, log, { now = Date.now(), maxSaved = REPLAY_MAX_SAVED_DEFAULT } = {}) {
  if (!hasStorageShape(storage)) {
    return { ok: false, status: 'failed', reason: 'STORAGE_UNAVAILABLE' };
  }
  if (!Number.isSafeInteger(maxSaved) || maxSaved < 1) {
    return { ok: false, status: 'failed', reason: 'MAX_SAVED_INVALID' };
  }
  const validation = validateReplayLog(log);
  if (!validation.ok) {
    return { ok: false, status: 'rejected', reason: validation.reason };
  }
  const savedAt = Number.isSafeInteger(now) && now >= 0 ? now : Date.now();
  const entry = deepFreeze({
    matchId: log.matchId,
    savedAt,
    eventCount: log.events.length,
    versions: cloneJson(log.versions)
  });

  let serialized;
  try {
    serialized = JSON.stringify(log);
  } catch {
    return { ok: false, status: 'failed', reason: 'SERIALIZE_FAILED' };
  }

  const key = replayKey(log.matchId);
  let previousRaw = null;
  try {
    previousRaw = storage.getItem(key);
  } catch {
    return { ok: false, status: 'failed', reason: 'STORAGE_READ_FAILED' };
  }

  try {
    storage.setItem(key, serialized);
  } catch {
    return { ok: false, status: 'failed', reason: 'STORAGE_WRITE_FAILED' };
  }
  let readback = null;
  try {
    readback = storage.getItem(key);
  } catch {
    readback = null;
  }
  if (readback !== serialized) {
    try {
      if (previousRaw == null) storage.removeItem(key);
      else storage.setItem(key, previousRaw);
    } catch {
      // 巻き戻しに失敗しても、保存の失敗として返すだけにする。
    }
    return { ok: false, status: 'failed', reason: 'STORAGE_VERIFY_FAILED' };
  }

  const indexRead = readIndex(storage);
  const entries = indexRead.entries.filter((item) => item.matchId !== log.matchId);
  entries.unshift(entry);
  const evicted = [];
  while (entries.length > maxSaved) {
    const removed = entries.pop();
    evicted.push(removed.matchId);
    try {
      storage.removeItem(replayKey(removed.matchId));
    } catch {
      // 古い分の消去に失敗しても、保存自体は残す。
    }
  }
  try {
    if (!writeIndex(storage, entries)) {
      return { ok: false, status: 'failed', reason: 'INDEX_WRITE_FAILED', evicted };
    }
  } catch {
    return { ok: false, status: 'failed', reason: 'INDEX_WRITE_FAILED', evicted };
  }
  return {
    ok: true,
    status: 'saved',
    matchId: log.matchId,
    savedAt,
    eventCount: log.events.length,
    evicted,
    indexRebuilt: indexRead.reason === 'INDEX_REBUILT'
  };
}

export function loadReplayLog(storage, matchId) {
  if (!hasStorageShape(storage)) {
    return { ok: false, status: 'failed', reason: 'STORAGE_UNAVAILABLE' };
  }
  if (!nonEmptyString(matchId)) {
    return { ok: false, status: 'unavailable', reason: 'MATCH_ID_INVALID' };
  }
  let raw;
  try {
    raw = storage.getItem(replayKey(matchId));
  } catch {
    return { ok: false, status: 'failed', reason: 'STORAGE_READ_FAILED' };
  }
  if (raw == null) {
    return { ok: false, status: 'unavailable', reason: 'NOT_FOUND' };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, status: 'unavailable', reason: 'CORRUPT' };
  }
  const validation = validateReplayLog(parsed);
  if (!validation.ok) {
    return { ok: false, status: 'unavailable', reason: validation.reason };
  }
  return { ok: true, status: 'loaded', log: deepFreeze(cloneJson(parsed)) };
}

export function listSavedReplays(storage) {
  if (!hasStorageShape(storage)) {
    return { ok: false, status: 'failed', reason: 'STORAGE_UNAVAILABLE', entries: [] };
  }
  const indexRead = readIndex(storage);
  if (!indexRead.ok) {
    return { ok: false, status: 'failed', reason: indexRead.reason, entries: [] };
  }
  return {
    ok: true,
    status: 'listed',
    entries: indexRead.entries,
    indexRebuilt: indexRead.reason === 'INDEX_REBUILT'
  };
}

export function deleteSavedReplay(storage, matchId) {
  if (!hasStorageShape(storage)) {
    return { ok: false, status: 'failed', reason: 'STORAGE_UNAVAILABLE' };
  }
  if (!nonEmptyString(matchId)) {
    return { ok: false, status: 'unavailable', reason: 'MATCH_ID_INVALID' };
  }
  const key = replayKey(matchId);
  let existed = false;
  try {
    existed = storage.getItem(key) != null;
    storage.removeItem(key);
  } catch {
    return { ok: false, status: 'failed', reason: 'STORAGE_WRITE_FAILED' };
  }
  const indexRead = readIndex(storage);
  const entries = indexRead.entries.filter((item) => item.matchId !== matchId);
  try {
    writeIndex(storage, entries);
  } catch {
    return { ok: false, status: 'failed', reason: 'INDEX_WRITE_FAILED', existed };
  }
  return { ok: true, status: 'deleted', matchId, existed };
}

export const BATTLE_REPLAY_PERSISTENCE_CORE = Object.freeze({
  schema: REPLAY_PERSISTENCE_SCHEMA,
  indexKey: REPLAY_INDEX_KEY,
  maxSavedDefault: REPLAY_MAX_SAVED_DEFAULT
});
