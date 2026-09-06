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

function inspectRawSave(rawValue) {
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

function classifyDeckProjection({ inspection, projection, authority } = {}) {
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
  if (!nonNegativeInteger(saveRevision) || !nonNegativeInteger(deckSize) || typeof deckLegal !== 'boolean') {
    return decision('blocked', 'DECK_PROJECTION_INVALID');
  }

  if (saveRevision > normalizedAuthority.currentSaveRevision) {
    return decision('blocked', 'SAVE_REVISION_NEWER');
  }

  const ruleIdMissing = ruleId === null || ruleId === undefined;
  const ruleRevisionMissing = ruleRevision === null || ruleRevision === undefined;
  if (ruleIdMissing && ruleRevisionMissing) {
    return decision(
      'recognized_legacy',
      deckLegal ? 'LEGACY_UNVERSIONED_CURRENT_COMPATIBLE' : 'LEGACY_UNVERSIONED_REPAIRABLE',
      { unversioned: true },
    );
  }
  if (ruleIdMissing !== ruleRevisionMissing) {
    return decision('blocked', 'RULE_IDENTITY_PARTIAL');
  }
  if (!nonEmptyString(ruleId) || !nonNegativeInteger(ruleRevision)) {
    return decision('blocked', 'RULE_IDENTITY_INVALID');
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

function prepareExplicitDeckCommit({
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

function readStorage(storage, key) {
  if (!storage || typeof storage.getItem !== 'function') return decision('failed', 'STORAGE_READ_UNAVAILABLE');
  if (!nonEmptyString(key)) throw new TypeError('STORAGE_KEY_REQUIRED');
  try {
    return decision('read', 'STORAGE_READ_OK', { rawValue: storage.getItem(key) });
  } catch {
    return decision('failed', 'STORAGE_READ_FAILED');
  }
}

function writePreparedSave(storage, key, preparedCommit) {
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

function restorePreviousRaw(storage, key, previousRawValue) {
  try {
    if (previousRawValue === null) {
      if (typeof storage.removeItem !== 'function') {
        return decision('failed', 'STORAGE_ROLLBACK_REMOVE_UNAVAILABLE', { originalPreserved: false });
      }
      storage.removeItem(key);
    } else {
      storage.setItem(key, previousRawValue);
    }
    const restored = storage.getItem(key);
    if (restored !== previousRawValue) {
      return decision('failed', 'STORAGE_ROLLBACK_VERIFY_FAILED', { originalPreserved: false });
    }
    return decision('restored', 'STORAGE_ROLLBACK_OK', { originalPreserved: true });
  } catch {
    return decision('failed', 'STORAGE_ROLLBACK_FAILED', { originalPreserved: false });
  }
}

function writePreparedSaveVerified(storage, key, preparedCommit, options = {}) {
  if (!preparedCommit || preparedCommit.schema !== SCHEMA || preparedCommit.status !== 'prepared') {
    return decision('failed', 'PREPARED_COMMIT_REQUIRED');
  }
  if (!storage || typeof storage.setItem !== 'function' || typeof storage.getItem !== 'function') {
    return decision('failed', 'STORAGE_VERIFIED_WRITE_UNAVAILABLE');
  }
  if (!nonEmptyString(key)) throw new TypeError('STORAGE_KEY_REQUIRED');

  const hasPreviousRawValue = Object.prototype.hasOwnProperty.call(options, 'previousRawValue');
  let previousRawValue;
  if (hasPreviousRawValue) {
    previousRawValue = options.previousRawValue;
    if (previousRawValue !== null && typeof previousRawValue !== 'string') {
      return decision('failed', 'PREVIOUS_RAW_INVALID');
    }
  }

  let currentRawValue;
  try {
    currentRawValue = storage.getItem(key);
  } catch {
    return decision('failed', 'STORAGE_READ_FAILED');
  }

  if (hasPreviousRawValue && currentRawValue !== previousRawValue) {
    return decision('failed', 'PREVIOUS_RAW_STALE', {
      originalPreserved: true,
      rolledBack: false,
    });
  }
  previousRawValue = currentRawValue;

  let writeFailed = false;
  try {
    storage.setItem(key, preparedCommit.serialized);
  } catch {
    writeFailed = true;
  }

  let readback;
  let readbackFailed = false;
  try {
    readback = storage.getItem(key);
  } catch {
    readbackFailed = true;
  }

  if (!writeFailed && !readbackFailed && readback === preparedCommit.serialized) {
    return decision('saved', 'STORAGE_WRITE_READBACK_OK', { originalPreserved: true });
  }

  if (writeFailed && !readbackFailed && readback === previousRawValue) {
    return decision('failed', 'STORAGE_WRITE_FAILED', { originalPreserved: true, rolledBack: false });
  }

  const failureReason = writeFailed
    ? 'STORAGE_WRITE_FAILED'
    : readbackFailed
      ? 'STORAGE_READBACK_FAILED'
      : 'STORAGE_READBACK_MISMATCH';
  const rollback = restorePreviousRaw(storage, key, previousRawValue);
  if (rollback.status !== 'restored') {
    return decision('failed', rollback.reason, {
      originalPreserved: false,
      rolledBack: false,
      writeFailureReason: failureReason,
    });
  }
  return decision('failed', failureReason, {
    originalPreserved: true,
    rolledBack: true,
  });
}

function normalizeStorageBatchEntries(entries) {
  if (!Array.isArray(entries) || entries.length === 0) throw new TypeError('STORAGE_BATCH_ENTRIES_REQUIRED');
  const normalized = entries.map((entry) => {
    if (!isPlainObject(entry) || !nonEmptyString(entry.key) || typeof entry.serialized !== 'string') {
      throw new TypeError('STORAGE_BATCH_ENTRY_INVALID');
    }
    const hasPreviousRawValue = Object.prototype.hasOwnProperty.call(entry, 'previousRawValue');
    if (hasPreviousRawValue && entry.previousRawValue !== null && typeof entry.previousRawValue !== 'string') {
      throw new TypeError('STORAGE_BATCH_PREVIOUS_RAW_INVALID');
    }
    return Object.freeze({
      key: entry.key,
      serialized: entry.serialized,
      hasPreviousRawValue,
      previousRawValue: hasPreviousRawValue ? entry.previousRawValue : undefined,
    });
  });
  if (new Set(normalized.map((entry) => entry.key)).size !== normalized.length) {
    throw new TypeError('STORAGE_BATCH_KEYS_DUPLICATE');
  }
  return Object.freeze(normalized);
}

function restoreStorageBatch(storage, entries, previousRawValues) {
  const rollbackFailures = [];
  for (const entry of [...entries].reverse()) {
    const restored = restorePreviousRaw(storage, entry.key, previousRawValues.get(entry.key));
    if (restored.status !== 'restored') {
      rollbackFailures.push(Object.freeze({ key: entry.key, reason: restored.reason }));
    }
  }
  if (rollbackFailures.length) {
    return decision('failed', 'STORAGE_BATCH_ROLLBACK_FAILED', {
      originalPreserved: false,
      rolledBack: false,
      rollbackFailures: Object.freeze(rollbackFailures),
    });
  }
  return decision('restored', 'STORAGE_BATCH_ROLLBACK_OK', {
    originalPreserved: true,
    rolledBack: true,
  });
}

function writeStorageBatchVerified(storage, entries) {
  if (!storage || typeof storage.setItem !== 'function' || typeof storage.getItem !== 'function') {
    return decision('failed', 'STORAGE_BATCH_WRITE_UNAVAILABLE');
  }
  const normalized = normalizeStorageBatchEntries(entries);
  const previousRawValues = new Map();

  for (const entry of normalized) {
    let currentRawValue;
    try {
      currentRawValue = storage.getItem(entry.key);
    } catch {
      return decision('failed', 'STORAGE_BATCH_READ_FAILED', {
        failureKey: entry.key,
        originalPreserved: true,
        rolledBack: false,
      });
    }
    if (entry.hasPreviousRawValue && currentRawValue !== entry.previousRawValue) {
      return decision('failed', 'STORAGE_BATCH_PREVIOUS_RAW_STALE', {
        failureKey: entry.key,
        originalPreserved: true,
        rolledBack: false,
      });
    }
    previousRawValues.set(entry.key, currentRawValue);
  }

  for (const entry of normalized) {
    let writeFailed = false;
    try {
      storage.setItem(entry.key, entry.serialized);
    } catch {
      writeFailed = true;
    }

    let readback;
    let readbackFailed = false;
    try {
      readback = storage.getItem(entry.key);
    } catch {
      readbackFailed = true;
    }

    if (!writeFailed && !readbackFailed && readback === entry.serialized) continue;

    const failureReason = writeFailed
      ? 'STORAGE_BATCH_WRITE_FAILED'
      : readbackFailed
        ? 'STORAGE_BATCH_READBACK_FAILED'
        : 'STORAGE_BATCH_READBACK_MISMATCH';
    const rollback = restoreStorageBatch(storage, normalized, previousRawValues);
    if (rollback.status !== 'restored') {
      return decision('failed', rollback.reason, {
        failureKey: entry.key,
        originalPreserved: false,
        rolledBack: false,
        writeFailureReason: failureReason,
        rollbackFailures: rollback.rollbackFailures,
      });
    }
    return decision('failed', failureReason, {
      failureKey: entry.key,
      originalPreserved: true,
      rolledBack: true,
    });
  }

  return decision('saved', 'STORAGE_BATCH_WRITE_READBACK_OK', {
    originalPreserved: true,
    savedKeys: Object.freeze(normalized.map((entry) => entry.key)),
  });
}

function resetExplicitSaveKeys(storage, keys, { confirmed = false } = {}) {
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

const DECK_SAVE_RECOVERY_CORE = Object.freeze({ schema: SCHEMA });


globalThis.GAMEROAD_DECK_SAVE_RECOVERY_CORE = Object.freeze({
  inspectRawSave,
  classifyDeckProjection,
  prepareExplicitDeckCommit,
  readStorage,
  writePreparedSave,
  writePreparedSaveVerified,
  writeStorageBatchVerified,
  resetExplicitSaveKeys,
  DECK_SAVE_RECOVERY_CORE,
});