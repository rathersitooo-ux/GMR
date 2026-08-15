const SCHEMA = 'gameroad.deck-save-recovery.v1';

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function freezeCopy(value) {
  return deepFreeze(cloneJson(value));
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function normalizePath(path) {
  if (!Array.isArray(path) || path.length === 0) throw new TypeError('PATH_REQUIRED');
  const normalized = path.map((segment) => {
    if (typeof segment === 'string' && segment.length > 0) return segment;
    if (nonNegativeInteger(segment)) return segment;
    throw new TypeError('PATH_SEGMENT_INVALID');
  });
  return Object.freeze(normalized);
}

function normalizeAuthority(authority = {}) {
  if (!nonNegativeInteger(authority.currentSaveRevision)) throw new TypeError('CURRENT_SAVE_REVISION_REQUIRED');
  if (!nonEmptyString(authority.currentRuleId)) throw new TypeError('CURRENT_RULE_ID_REQUIRED');
  if (!nonNegativeInteger(authority.currentRuleRevision)) throw new TypeError('CURRENT_RULE_REVISION_REQUIRED');

  const legacy = Array.isArray(authority.recognizedLegacyRules) ? authority.recognizedLegacyRules : [];
  const recognizedLegacyRules = legacy.map((entry) => {
    if (!isPlainObject(entry) || !nonEmptyString(entry.ruleId) || !nonNegativeInteger(entry.ruleRevision)) {
      throw new TypeError('LEGACY_RULE_INVALID');
    }
    if (!Array.isArray(entry.deckSizes) || entry.deckSizes.length === 0 || entry.deckSizes.some((size) => !positiveInteger(size))) {
      throw new TypeError('LEGACY_DECK_SIZES_INVALID');
    }
    return Object.freeze({
      ruleId: entry.ruleId,
      ruleRevision: entry.ruleRevision,
      deckSizes: Object.freeze([...new Set(entry.deckSizes)]),
    });
  });

  return Object.freeze({
    currentSaveRevision: authority.currentSaveRevision,
    currentRuleId: authority.currentRuleId,
    currentRuleRevision: authority.currentRuleRevision,
    recognizedLegacyRules: Object.freeze(recognizedLegacyRules),
  });
}

function decision(status, reason, extra = {}) {
  return deepFreeze({ schema: SCHEMA, status, reason, ...extra });
}

export function inspectRawSave(rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === '') {
    return decision('missing', 'SAVE_MISSING', { parsed: null });
  }
  if (typeof rawValue !== 'string') {
    return decision('corrupt', 'SAVE_RAW_NOT_STRING', { parsed: null });
  }

  let parsed;
  try {
    parsed = JSON.parse(rawValue);
  } catch {
    return decision('corrupt', 'SAVE_JSON_INVALID', { parsed: null });
  }
  if (!isPlainObject(parsed)) {
    return decision('corrupt', 'SAVE_ROOT_NOT_OBJECT', { parsed: null });
  }
  return decision('parsed', 'SAVE_PARSED', { parsed: freezeCopy(parsed) });
}

export function classifyDeckProjection({ inspection, projection, authority } = {}) {
  if (!inspection || inspection.schema !== SCHEMA) throw new TypeError('INSPECTION_REQUIRED');
  const normalizedAuthority = normalizeAuthority(authority);

  if (inspection.status === 'missing') {
    return decision('missing', 'SAVE_MISSING');
  }
  if (inspection.status !== 'parsed') {
    return decision('blocked', 'SAVE_CORRUPT');
  }
  if (!isPlainObject(projection)) {
    return decision('blocked', 'DECK_PROJECTION_MISSING');
  }

  const { saveRevision, ruleId, ruleRevision, deckSize, deckLegal } = projection;
  if (!nonNegativeInteger(saveRevision) || !nonEmptyString(ruleId) ||
      !nonNegativeInteger(ruleRevision) || !nonNegativeInteger(deckSize) ||
      typeof deckLegal !== 'boolean') {
    return decision('blocked', 'DECK_PROJECTION_INVALID');
  }

  if (saveRevision > normalizedAuthority.currentSaveRevision) {
    return decision('blocked', 'SAVE_REVISION_NEWER');
  }

  const isCurrentRule = ruleId === normalizedAuthority.currentRuleId &&
    ruleRevision === normalizedAuthority.currentRuleRevision;
  if (isCurrentRule) {
    if (deckLegal !== true) return decision('blocked', 'CURRENT_DECK_ILLEGAL');
    return decision('current', 'CURRENT_DECK_VALID');
  }

  const recognizedLegacy = normalizedAuthority.recognizedLegacyRules.some((entry) =>
    entry.ruleId === ruleId &&
    entry.ruleRevision === ruleRevision &&
    entry.deckSizes.includes(deckSize));
  if (recognizedLegacy) {
    return decision('recognized_legacy', 'LEGACY_DECK_REPAIRABLE');
  }

  return decision('blocked', 'RULE_UNKNOWN_OR_UNSUPPORTED');
}

function setAtPath(root, path, nextValue) {
  const normalizedPath = normalizePath(path);
  const base = isPlainObject(root) ? cloneJson(root) : {};
  let cursor = base;
  for (let index = 0; index < normalizedPath.length - 1; index += 1) {
    const segment = normalizedPath[index];
    const nextSegment = normalizedPath[index + 1];
    const existing = cursor[segment];
    if (existing === undefined || existing === null) {
      cursor[segment] = typeof nextSegment === 'number' ? [] : {};
    } else if (typeof nextSegment === 'number') {
      if (!Array.isArray(existing)) throw new TypeError('PATH_CONTAINER_MISMATCH');
    } else if (!isPlainObject(existing)) {
      throw new TypeError('PATH_CONTAINER_MISMATCH');
    }
    cursor = cursor[segment];
  }
  cursor[normalizedPath[normalizedPath.length - 1]] = cloneJson(nextValue);
  return base;
}

export function prepareExplicitDeckCommit({
  inspection,
  currentClassification,
  path,
  nextDeckRecord,
  nextProjection,
  authority,
} = {}) {
  if (!inspection || inspection.schema !== SCHEMA) throw new TypeError('INSPECTION_REQUIRED');
  if (!currentClassification || currentClassification.schema !== SCHEMA) throw new TypeError('CLASSIFICATION_REQUIRED');

  const allowedSource = currentClassification.status === 'missing' ||
    currentClassification.status === 'recognized_legacy' ||
    currentClassification.status === 'current';
  if (!allowedSource) return decision('blocked', 'SOURCE_NOT_COMMITTABLE');

  if (!isPlainObject(nextDeckRecord)) return decision('blocked', 'NEXT_DECK_RECORD_INVALID');
  const nextCheck = classifyDeckProjection({
    inspection: inspection.status === 'missing' ? decision('parsed', 'SAVE_PARSED', { parsed: {} }) : inspection,
    projection: nextProjection,
    authority,
  });
  if (nextCheck.status !== 'current') return decision('blocked', 'NEXT_DECK_NOT_CURRENT_LEGAL');

  let nextRoot;
  try {
    nextRoot = setAtPath(inspection.status === 'parsed' ? inspection.parsed : {}, path, nextDeckRecord);
  } catch (error) {
    return decision('blocked', error?.message || 'PATH_UPDATE_FAILED');
  }

  return decision('prepared', 'EXPLICIT_CURRENT_COMMIT_READY', {
    serialized: JSON.stringify(nextRoot),
    nextRoot: freezeCopy(nextRoot),
  });
}

export function readStorage(storage, key) {
  if (!storage || typeof storage.getItem !== 'function') return decision('failed', 'STORAGE_READ_UNAVAILABLE');
  if (!nonEmptyString(key)) throw new TypeError('STORAGE_KEY_REQUIRED');
  try {
    return decision('read', 'STORAGE_READ_OK', { rawValue: storage.getItem(key) });
  } catch {
    return decision('failed', 'STORAGE_READ_FAILED');
  }
}

export function writePreparedSave(storage, key, preparedCommit) {
  if (!preparedCommit || preparedCommit.schema !== SCHEMA || preparedCommit.status !== 'prepared') {
    return decision('failed', 'PREPARED_COMMIT_REQUIRED');
  }
  if (!storage || typeof storage.setItem !== 'function') return decision('failed', 'STORAGE_WRITE_UNAVAILABLE');
  if (!nonEmptyString(key)) throw new TypeError('STORAGE_KEY_REQUIRED');
  try {
    storage.setItem(key, preparedCommit.serialized);
    return decision('saved', 'STORAGE_WRITE_OK');
  } catch {
    return decision('failed', 'STORAGE_WRITE_FAILED');
  }
}

export function resetExplicitSaveKeys(storage, keys, { confirmed = false } = {}) {
  if (confirmed !== true) return decision('blocked', 'RESET_CONFIRMATION_REQUIRED');
  if (!storage || typeof storage.removeItem !== 'function') return decision('failed', 'STORAGE_REMOVE_UNAVAILABLE');
  if (!Array.isArray(keys) || keys.length === 0 || keys.some((key) => !nonEmptyString(key))) {
    throw new TypeError('RESET_KEYS_REQUIRED');
  }
  const uniqueKeys = [...new Set(keys)];
  try {
    for (const key of uniqueKeys) storage.removeItem(key);
    return decision('reset', 'STORAGE_REMOVE_OK', { removedKeys: Object.freeze(uniqueKeys) });
  } catch {
    return decision('failed', 'STORAGE_REMOVE_FAILED');
  }
}

export const DECK_SAVE_RECOVERY_CORE = Object.freeze({ schema: SCHEMA });
