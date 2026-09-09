import {
  PARTNER_COSTUME_CATEGORIES,
  createPartnerCostumeSession,
  createPartnerCostumeSnapshot,
} from './partner-costume-core.mjs';

function fail(message) {
  throw new TypeError(message);
}

function requireFunction(value, label) {
  if (typeof value !== 'function') fail(`${label} must be a function`);
  return value;
}

function requireCatalog(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('catalog must be an object');
  return value;
}

function cloneSelection(selection = {}) {
  return Object.fromEntries(PARTNER_COSTUME_CATEGORIES.map((category) => [category, selection?.[category] ?? null]));
}

function cloneView({ partnerId, session, saving, lastError }) {
  return Object.freeze({
    partnerId,
    draftSelection: Object.freeze(cloneSelection(session.getDraftSelection())),
    savedSelection: Object.freeze(cloneSelection(session.getSavedSelection())),
    saving,
    lastError,
  });
}

/**
 * Browser-side costume session orchestration only.
 *
 * The caller owns authentication, production persistence, entitlement/catalog
 * authority, retry policy, and transport. Draft actions stay local. A saved
 * baseline is replaced only from the authoritative snapshot returned by the
 * caller supplied save function.
 */
export function createPartnerCostumeBrowserSessionRuntime({
  catalog,
  loadAuthoritativeSnapshot,
  saveAuthoritativeSelection,
} = {}) {
  const costumeCatalog = requireCatalog(catalog);
  const loadSnapshot = requireFunction(loadAuthoritativeSnapshot, 'loadAuthoritativeSnapshot');
  const saveSelection = requireFunction(saveAuthoritativeSelection, 'saveAuthoritativeSelection');

  let snapshot = null;
  let partnerId = null;
  let session = null;
  let saving = false;
  let lastError = null;

  function requireStarted() {
    if (!session || !partnerId || !snapshot) fail('partner costume browser session has not started');
  }

  function rebuildFromAuthoritativeSnapshot(rawSnapshot) {
    const next = createPartnerCostumeSnapshot(rawSnapshot);
    if (!next.selectedPartnerId) fail('authoritative costume snapshot has no selected partner');
    snapshot = next;
    partnerId = next.selectedPartnerId;
    session = createPartnerCostumeSession({ snapshot, partnerId, catalog: costumeCatalog });
    lastError = null;
    return cloneView({ partnerId, session, saving, lastError });
  }

  async function start() {
    if (saving) fail('cannot reload partner costume while save is in flight');
    return rebuildFromAuthoritativeSnapshot(await loadSnapshot());
  }

  function getView() {
    requireStarted();
    return cloneView({ partnerId, session, saving, lastError });
  }

  function equip(category, itemId) {
    requireStarted();
    if (saving) fail('cannot change partner costume while save is in flight');
    lastError = null;
    const result = session.equip(category, itemId);
    return Object.freeze({ ...result, view: getView() });
  }

  function clear(category) {
    requireStarted();
    if (saving) fail('cannot change partner costume while save is in flight');
    lastError = null;
    session.clear(category);
    return getView();
  }

  function equipRecommendedSet(set) {
    requireStarted();
    if (saving) fail('cannot change partner costume while save is in flight');
    lastError = null;
    session.equipRecommendedSet(set);
    return getView();
  }

  function revert() {
    requireStarted();
    if (saving) fail('cannot change partner costume while save is in flight');
    lastError = null;
    session.revert();
    return getView();
  }

  async function save({ requestId } = {}) {
    requireStarted();
    if (saving) fail('partner costume save is already in flight');
    if (typeof requestId !== 'string' || requestId.trim().length === 0) fail('requestId must be a non-empty string');

    const savingPartnerId = partnerId;
    const requestedSelection = cloneSelection(session.getDraftSelection());
    saving = true;
    lastError = null;
    try {
      const authoritativeSnapshot = await saveSelection(Object.freeze({
        partnerId: savingPartnerId,
        selection: Object.freeze(requestedSelection),
        requestId: requestId.trim(),
      }));
      const normalized = createPartnerCostumeSnapshot(authoritativeSnapshot);
      if (normalized.selectedPartnerId !== savingPartnerId) fail('save response changed selected partner');
      const authoritativeSelection = cloneSelection(normalized.partners?.[savingPartnerId]?.savedSelection);
      for (const category of PARTNER_COSTUME_CATEGORIES) {
        if (authoritativeSelection[category] !== requestedSelection[category]) {
          fail(`save response does not confirm requested ${category} selection`);
        }
      }
      saving = false;
      return rebuildFromAuthoritativeSnapshot(normalized);
    } catch (error) {
      saving = false;
      lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  return Object.freeze({
    start,
    getView,
    equip,
    clear,
    equipRecommendedSet,
    revert,
    save,
  });
}
