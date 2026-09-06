const SCHEMA = 'gameroad.deck-save-recovery.v1';
const ATOMICITY_SCHEMA = 'gameroad.deck-save-atomicity-guard.v1';
const DECK_DRAFT_SESSION_SUFFIX = '.deckDraft.session.v1';
const DECK_LIBRARY_SUFFIX = '.deckSlots.v1';

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

function atomicityDecision(status, reason, extra = {}) {
  return deepFreeze({ schema: ATOMICITY_SCHEMA, status, reason, ...extra });
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

function normalizeAtomicDeckRecord(deck) {
  return {
    main: Array.isArray(deck?.main) ? deck.main.map(String) : [],
    ex: Array.isArray(deck?.ex) ? deck.ex.map(String) : [],
  };
}

function sameAtomicDeck(left, right) {
  return JSON.stringify(normalizeAtomicDeckRecord(left)) === JSON.stringify(normalizeAtomicDeckRecord(right));
}

function deriveLiveDeckSaveKeys(api) {
  const draftSessionKey = api?.deckDraftSessionKey?.();
  if (!nonEmptyString(draftSessionKey) || !draftSessionKey.endsWith(DECK_DRAFT_SESSION_SUFFIX)) return null;
  const rootKey = draftSessionKey.slice(0, -DECK_DRAFT_SESSION_SUFFIX.length);
  if (!nonEmptyString(rootKey)) return null;
  return Object.freeze({
    rootKey,
    libraryKey: `${rootKey}${DECK_LIBRARY_SUFFIX}`,
    draftSessionKey,
  });
}

function expectedDeckLibraryRaw(deckSlots, selectedDeckIndex, deckDraft) {
  if (!Array.isArray(deckSlots) || !Number.isInteger(selectedDeckIndex) || selectedDeckIndex < 0 || selectedDeckIndex >= deckSlots.length) return null;
  const slots = deckSlots.map(normalizeAtomicDeckRecord);
  slots[selectedDeckIndex] = normalizeAtomicDeckRecord(deckDraft);
  return JSON.stringify({ schema: 'gameroad.deck-slots.v1', slots });
}

function captureDeckSaveAtomicitySnapshot({
  storage,
  sessionStorage,
  api,
  state = api?.state,
  requiresRootSave = true,
} = {}) {
  if (requiresRootSave !== true) return atomicityDecision('bypass', 'LIBRARY_ONLY_PATH_UNCHANGED');
  const keys = deriveLiveDeckSaveKeys(api);
  if (!keys) return atomicityDecision('blocked', 'LIVE_SAVE_KEYS_UNAVAILABLE');
  if (!state || !Array.isArray(state.deckSlots) || !isPlainObject(state.deckDraft)) {
    return atomicityDecision('blocked', 'LIVE_DECK_STATE_UNAVAILABLE');
  }
  const expectedLibraryRaw = expectedDeckLibraryRaw(state.deckSlots, state.selectedDeckIndex, state.deckDraft);
  if (!expectedLibraryRaw) return atomicityDecision('blocked', 'LIVE_DECK_LIBRARY_EXPECTATION_INVALID');
  const rule = api?.deckRule?.();
  if (!isPlainObject(rule) || !nonEmptyString(rule.id) || !nonNegativeInteger(rule.revision)) {
    return atomicityDecision('blocked', 'LIVE_DECK_RULE_UNAVAILABLE');
  }
  try {
    return atomicityDecision('captured', 'ATOMIC_BASELINE_CAPTURED', {
      keys,
      rootRaw: storage.getItem(keys.rootKey),
      libraryRaw: storage.getItem(keys.libraryKey),
      draftSessionRaw: sessionStorage?.getItem?.(keys.draftSessionKey) ?? null,
      expectedLibraryRaw,
      expectedDeck: normalizeAtomicDeckRecord(state.deckDraft),
      expectedRule: { id: rule.id, revision: rule.revision },
      stateBaseline: {
        deckSlots: cloneJson(state.deckSlots),
        selectedDeckIndex: state.selectedDeckIndex,
        savedDeck: cloneJson(state.savedDeck),
        savedDeckRule: cloneJson(state.savedDeckRule),
        deckDraft: cloneJson(state.deckDraft),
        saveAuthorityDeck: cloneJson(state.saveAuthorityDeck),
        saveAuthorityDeckRule: cloneJson(state.saveAuthorityDeckRule),
        storage: state.storage,
      },
    });
  } catch {
    return atomicityDecision('blocked', 'ATOMIC_BASELINE_READ_FAILED');
  }
}

function rootRawMatchesAtomicExpectation(rawValue, snapshot) {
  if (typeof rawValue !== 'string') return false;
  try {
    const parsed = JSON.parse(rawValue);
    const deck = parsed?.deck;
    return isPlainObject(deck)
      && sameAtomicDeck(deck, snapshot.expectedDeck)
      && deck.ruleId === snapshot.expectedRule.id
      && deck.ruleRevision === snapshot.expectedRule.revision;
  } catch {
    return false;
  }
}

function restoreAtomicState(state, baseline) {
  if (!state || !baseline) return false;
  state.deckSlots = cloneJson(baseline.deckSlots);
  state.selectedDeckIndex = baseline.selectedDeckIndex;
  state.savedDeck = cloneJson(baseline.savedDeck);
  state.savedDeckRule = cloneJson(baseline.savedDeckRule);
  state.deckDraft = cloneJson(baseline.deckDraft);
  state.saveAuthorityDeck = cloneJson(baseline.saveAuthorityDeck);
  state.saveAuthorityDeckRule = cloneJson(baseline.saveAuthorityDeckRule);
  state.storage = 'memory';
  return true;
}

function settleDeckSaveAtomicitySnapshot({
  snapshot,
  storage,
  sessionStorage,
  api,
  state = api?.state,
  saveReceipt,
} = {}) {
  if (!snapshot || snapshot.schema !== ATOMICITY_SCHEMA || snapshot.status !== 'captured') {
    return atomicityDecision('failed', 'ATOMIC_BASELINE_REQUIRED');
  }
  let rootRaw;
  let libraryRaw;
  let postReadFailed = false;
  try {
    rootRaw = storage.getItem(snapshot.keys.rootKey);
    libraryRaw = storage.getItem(snapshot.keys.libraryKey);
  } catch {
    postReadFailed = true;
  }
  const receiptSaved = saveReceipt?.status === 'saved';
  const rootExact = !postReadFailed && rootRawMatchesAtomicExpectation(rootRaw, snapshot);
  const libraryExact = !postReadFailed && libraryRaw === snapshot.expectedLibraryRaw;
  if (receiptSaved && rootExact && libraryExact) {
    return atomicityDecision('saved', 'ATOMIC_ROOT_AND_LIBRARY_READBACK_OK', {
      rootExact: true,
      libraryExact: true,
      originalPreserved: true,
    });
  }

  const rootRollback = restorePreviousRaw(storage, snapshot.keys.rootKey, snapshot.rootRaw);
  const libraryRollback = restorePreviousRaw(storage, snapshot.keys.libraryKey, snapshot.libraryRaw);
  const stateRestored = restoreAtomicState(state, snapshot.stateBaseline);
  const sessionRollback = sessionStorage?.getItem && sessionStorage?.setItem && sessionStorage?.removeItem
    ? restorePreviousRaw(sessionStorage, snapshot.keys.draftSessionKey, snapshot.draftSessionRaw)
    : decision('failed', 'DRAFT_SESSION_ROLLBACK_UNAVAILABLE', { originalPreserved: false });
  if (snapshot.draftSessionRaw === null && stateRestored) {
    try { api?.deckDraftSessionSave?.(); } catch {}
  }
  const originalPreserved = rootRollback.status === 'restored'
    && libraryRollback.status === 'restored'
    && stateRestored
    && sessionRollback.status === 'restored';
  const reason = postReadFailed
    ? 'ATOMIC_POST_READ_FAILED'
    : !receiptSaved
      ? 'AUTHORITATIVE_ROOT_SAVE_NOT_CONFIRMED'
      : !rootExact
        ? 'AUTHORITATIVE_ROOT_DECK_MISMATCH'
        : 'DECK_LIBRARY_READBACK_MISMATCH';
  return atomicityDecision('failed', originalPreserved ? reason : 'ATOMIC_ROLLBACK_FAILED', {
    failureReason: reason,
    rootExact,
    libraryExact,
    originalPreserved,
    rootRollback: rootRollback.reason,
    libraryRollback: libraryRollback.reason,
    sessionRollback: sessionRollback.reason,
  });
}

const liveDeckSaveAtomicityInstallations = new WeakMap();
let liveDeckSaveAtomicityStatus = atomicityDecision('idle', 'LIVE_GUARD_NOT_INSTALLED');

function renderLiveDeckSaveAtomicityFailure(doc, api, message) {
  try { api?.show?.('cards', { skipCrossScreenMotion: true }); } catch {}
  const toast = doc?.querySelector?.('#toast');
  if (toast) {
    toast.textContent = message;
    toast.dataset.toastScreen = 'cards';
    toast.classList?.add?.('on');
  }
}

function installLiveDeckSaveAtomicityGuard({ document: doc = globalThis.document, window: win = globalThis.window } = {}) {
  if (!doc?.querySelector || !doc?.addEventListener) return atomicityDecision('disabled', 'LIVE_DOCUMENT_UNAVAILABLE');
  const existing = liveDeckSaveAtomicityInstallations.get(doc);
  if (existing) return existing;
  const button = doc.querySelector('#saveDeck');
  if (!button?.addEventListener) return atomicityDecision('disabled', 'LIVE_SAVE_BUTTON_UNAVAILABLE');

  const onCapture = (event) => {
    const validation = doc.querySelector('#deckValidation');
    if (!validation?.classList?.contains?.('ok')) {
      liveDeckSaveAtomicityStatus = atomicityDecision('bypass', 'LIBRARY_ONLY_PATH_UNCHANGED');
      return;
    }
    const api = win?.__GAMEROAD_TEST__ ?? globalThis.__GAMEROAD_TEST__;
    const storage = win?.localStorage ?? globalThis.localStorage;
    const session = win?.sessionStorage ?? globalThis.sessionStorage;
    const snapshot = captureDeckSaveAtomicitySnapshot({ storage, sessionStorage: session, api, requiresRootSave: true });
    if (snapshot.status !== 'captured') {
      event?.preventDefault?.();
      event?.stopImmediatePropagation?.();
      liveDeckSaveAtomicityStatus = snapshot;
      renderLiveDeckSaveAtomicityFailure(doc, api, '端末保存を確認できないため保存しません。変更は未保存のままです');
      return;
    }
    liveDeckSaveAtomicityStatus = atomicityDecision('pending', 'ATOMIC_SAVE_IN_FLIGHT');
    const settle = () => {
      const receipt = win?.__GAMEROAD_SAVE_RECOVERY__?.snapshot?.().write
        ?? globalThis.__GAMEROAD_SAVE_RECOVERY__?.snapshot?.().write
        ?? null;
      const result = settleDeckSaveAtomicitySnapshot({
        snapshot,
        storage,
        sessionStorage: session,
        api,
        saveReceipt: receipt,
      });
      liveDeckSaveAtomicityStatus = result;
      if (result.status !== 'saved') {
        renderLiveDeckSaveAtomicityFailure(doc, api, 'デッキ保存を確認できません。変更は未保存のままです');
      }
    };
    if (typeof win?.queueMicrotask === 'function') win.queueMicrotask(settle);
    else if (typeof globalThis.queueMicrotask === 'function') globalThis.queueMicrotask(settle);
    else Promise.resolve().then(settle);
  };

  button.addEventListener('click', onCapture, true);
  const installation = Object.freeze({
    schema: ATOMICITY_SCHEMA,
    status: () => cloneJson(liveDeckSaveAtomicityStatus),
    dispose() {
      button.removeEventListener?.('click', onCapture, true);
      liveDeckSaveAtomicityInstallations.delete(doc);
    },
  });
  liveDeckSaveAtomicityInstallations.set(doc, installation);
  liveDeckSaveAtomicityStatus = atomicityDecision('ready', 'LIVE_GUARD_INSTALLED');
  return installation;
}

function autoInstallLiveDeckSaveAtomicityGuard(doc, win) {
  const install = () => installLiveDeckSaveAtomicityGuard({ document: doc, window: win });
  if (doc?.readyState === 'loading') doc.addEventListener?.('DOMContentLoaded', install, { once: true });
  else install();
}

const DECK_SAVE_RECOVERY_CORE = Object.freeze({ schema: SCHEMA, atomicitySchema: ATOMICITY_SCHEMA });


globalThis.GAMEROAD_DECK_SAVE_RECOVERY_CORE = Object.freeze({
  inspectRawSave,
  classifyDeckProjection,
  prepareExplicitDeckCommit,
  readStorage,
  writePreparedSave,
  writePreparedSaveVerified,
  resetExplicitSaveKeys,
  deriveLiveDeckSaveKeys,
  expectedDeckLibraryRaw,
  captureDeckSaveAtomicitySnapshot,
  settleDeckSaveAtomicitySnapshot,
  installLiveDeckSaveAtomicityGuard,
  DECK_SAVE_RECOVERY_CORE,
});

globalThis.GAMEROAD_DECK_SAVE_ATOMICITY_GUARD = Object.freeze({
  schema: ATOMICITY_SCHEMA,
  snapshot: () => cloneJson(liveDeckSaveAtomicityStatus),
  install: installLiveDeckSaveAtomicityGuard,
});

if (typeof document !== 'undefined') {
  autoInstallLiveDeckSaveAtomicityGuard(document, globalThis.window);
}
