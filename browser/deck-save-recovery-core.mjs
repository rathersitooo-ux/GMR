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

function normalizeCompanionWrites(companionWrites) {
  if (companionWrites === undefined) return Object.freeze([]);
  if (!Array.isArray(companionWrites)) throw new TypeError('COMPANION_WRITES_INVALID');
  return Object.freeze(companionWrites.map((entry) => {
    if (!isPlainObject(entry) || !nonEmptyString(entry.key) || typeof entry.serialized !== 'string') {
      throw new TypeError('COMPANION_WRITE_INVALID');
    }
    const normalized = { key: entry.key, serialized: entry.serialized };
    if (Object.prototype.hasOwnProperty.call(entry, 'previousRawValue')) {
      if (entry.previousRawValue !== null && typeof entry.previousRawValue !== 'string') {
        throw new TypeError('COMPANION_PREVIOUS_RAW_INVALID');
      }
      normalized.previousRawValue = entry.previousRawValue;
    }
    return Object.freeze(normalized);
  }));
}

function rollbackCapturedKeys(storage, snapshots, keys) {
  const failures = [];
  for (const key of [...keys].reverse()) {
    const restored = restorePreviousRaw(storage, key, snapshots.get(key));
    if (restored.status !== 'restored') failures.push(Object.freeze({ key, reason: restored.reason }));
  }
  return Object.freeze({ ok: failures.length === 0, failures: Object.freeze(failures) });
}

function writePreparedSaveTransaction(storage, primaryKey, preparedCommit, companionWrites = [], options = {}) {
  if (!preparedCommit || preparedCommit.schema !== SCHEMA || preparedCommit.status !== 'prepared') {
    return decision('failed', 'PREPARED_COMMIT_REQUIRED');
  }
  if (!storage || typeof storage.setItem !== 'function' || typeof storage.getItem !== 'function') {
    return decision('failed', 'STORAGE_VERIFIED_WRITE_UNAVAILABLE');
  }
  if (!nonEmptyString(primaryKey)) throw new TypeError('STORAGE_KEY_REQUIRED');

  let companions;
  try {
    companions = normalizeCompanionWrites(companionWrites);
  } catch (error) {
    return decision('failed', error?.message || 'COMPANION_WRITES_INVALID');
  }

  const allKeys = [primaryKey, ...companions.map((entry) => entry.key)];
  if (new Set(allKeys).size !== allKeys.length) {
    return decision('failed', 'STORAGE_TRANSACTION_DUPLICATE_KEY', { originalPreserved: true, rolledBack: false });
  }

  const primaryHasPrevious = Object.prototype.hasOwnProperty.call(options, 'previousRawValue');
  if (primaryHasPrevious && options.previousRawValue !== null && typeof options.previousRawValue !== 'string') {
    return decision('failed', 'PREVIOUS_RAW_INVALID');
  }

  const snapshots = new Map();
  try {
    for (const key of allKeys) snapshots.set(key, storage.getItem(key));
  } catch {
    return decision('failed', 'STORAGE_TRANSACTION_SNAPSHOT_FAILED', { originalPreserved: true, rolledBack: false });
  }

  if (primaryHasPrevious && snapshots.get(primaryKey) !== options.previousRawValue) {
    return decision('failed', 'PREVIOUS_RAW_STALE', { originalPreserved: true, rolledBack: false });
  }
  for (const companion of companions) {
    if (Object.prototype.hasOwnProperty.call(companion, 'previousRawValue') &&
        snapshots.get(companion.key) !== companion.previousRawValue) {
      return decision('failed', 'COMPANION_PREVIOUS_RAW_STALE', {
        staleKey: companion.key,
        originalPreserved: true,
        rolledBack: false,
      });
    }
  }

  const committedCompanionKeys = [];
  for (const companion of companions) {
    const companionPrepared = decision('prepared', 'COMPANION_COMMIT_READY', { serialized: companion.serialized });
    const written = writePreparedSaveVerified(storage, companion.key, companionPrepared, {
      previousRawValue: snapshots.get(companion.key),
    });
    if (written.status !== 'saved') {
      const rollback = rollbackCapturedKeys(storage, snapshots, committedCompanionKeys);
      const originalPreserved = written.originalPreserved !== false && rollback.ok;
      return decision('failed', rollback.ok ? 'STORAGE_TRANSACTION_COMPANION_FAILED' : 'STORAGE_TRANSACTION_ROLLBACK_FAILED', {
        failedKey: companion.key,
        writeFailureReason: written.reason,
        originalPreserved,
        rolledBack: committedCompanionKeys.length > 0 && rollback.ok,
        rollbackFailures: rollback.failures,
      });
    }
    committedCompanionKeys.push(companion.key);
  }

  const primaryWritten = writePreparedSaveVerified(storage, primaryKey, preparedCommit, {
    previousRawValue: snapshots.get(primaryKey),
  });
  if (primaryWritten.status !== 'saved') {
    const rollback = rollbackCapturedKeys(storage, snapshots, committedCompanionKeys);
    const originalPreserved = primaryWritten.originalPreserved !== false && rollback.ok;
    return decision('failed', rollback.ok ? 'STORAGE_TRANSACTION_PRIMARY_FAILED' : 'STORAGE_TRANSACTION_ROLLBACK_FAILED', {
      failedKey: primaryKey,
      writeFailureReason: primaryWritten.reason,
      originalPreserved,
      rolledBack: committedCompanionKeys.length > 0 && rollback.ok,
      rollbackFailures: rollback.failures,
    });
  }

  let finalMismatchKey = null;
  try {
    for (const companion of companions) {
      if (storage.getItem(companion.key) !== companion.serialized) {
        finalMismatchKey = companion.key;
        break;
      }
    }
    if (!finalMismatchKey && storage.getItem(primaryKey) !== preparedCommit.serialized) finalMismatchKey = primaryKey;
  } catch {
    finalMismatchKey = '__READ_FAILED__';
  }

  if (finalMismatchKey) {
    const rollback = rollbackCapturedKeys(storage, snapshots, [...committedCompanionKeys, primaryKey]);
    return decision('failed', rollback.ok ? 'STORAGE_TRANSACTION_FINAL_READBACK_FAILED' : 'STORAGE_TRANSACTION_ROLLBACK_FAILED', {
      failedKey: finalMismatchKey,
      originalPreserved: rollback.ok,
      rolledBack: rollback.ok,
      rollbackFailures: rollback.failures,
    });
  }

  return decision('saved', 'STORAGE_TRANSACTION_READBACK_OK', {
    keys: Object.freeze([...allKeys]),
    originalPreserved: true,
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
  writePreparedSaveTransaction,
  resetExplicitSaveKeys,
  DECK_SAVE_RECOVERY_CORE,
});
