import {
  PARTNER_COSTUME_CATEGORIES,
  buildPartnerCostumeLayers,
  createPartnerCostumeSession,
  createPartnerCostumeSnapshot,
} from './partner-costume-core.mjs';

const RUNTIME_NAME = 'GAMEROAD_PARTNER_COSTUME_RUNTIME';
const PROVIDER_NAME = 'GAMEROAD_PARTNER_COSTUME_PROVIDER';
const RUNTIME_VERSION = 'gameroad.partner-costume-runtime.v1';
const STYLE_ID = 'gameroad-partner-costume-style';
const ENTRY_SELECTOR = '[data-gr-partner-costume-entry="1"]';
const OVERLAY_SELECTOR = '[data-gr-partner-costume-overlay="1"]';
const DETAIL_SELECTOR = '[data-gr-partner-costume-detail="1"]';
const PARTNER_SURFACE_SELECTORS = Object.freeze(['#charDetail', '[data-screen="characters"]']);
const CATEGORY_LABELS = Object.freeze({ shoes: 'シューズ', coord: 'コーデ', accessory: 'アクセ' });

function fail(message) {
  throw new TypeError(message);
}

function requireFunction(value, label) {
  if (typeof value !== 'function') fail(`${label} must be a function`);
  return value;
}

function requireId(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) fail(`${label} must be a non-empty string`);
  return value.trim();
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  return value;
}

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function normalizeProvider(global) {
  const provider = global?.[PROVIDER_NAME];
  if (!provider) return null;
  requireObject(provider, PROVIDER_NAME);
  return Object.freeze({
    loadState: requireFunction(provider.loadState, `${PROVIDER_NAME}.loadState`).bind(provider),
    saveState: requireFunction(provider.saveState, `${PROVIDER_NAME}.saveState`).bind(provider),
  });
}

export function normalizePartnerCostumeProviderState(payload) {
  requireObject(payload, 'partner costume provider state');
  const activePartnerId = requireId(payload.activePartnerId, 'activePartnerId');
  const snapshot = createPartnerCostumeSnapshot(requireObject(payload.snapshot, 'snapshot'));
  if (snapshot.selectedPartnerId !== null && snapshot.selectedPartnerId !== activePartnerId) {
    fail('provider selectedPartnerId must match activePartnerId');
  }
  const partnerState = snapshot.partners[activePartnerId];
  if (!partnerState) fail('provider snapshot must contain active partner state');
  const catalog = requireObject(payload.catalog, 'catalog');
  const baseLayers = payload.baseLayers === undefined ? [] : payload.baseLayers;
  if (!Array.isArray(baseLayers)) fail('baseLayers must be an array');
  return Object.freeze({ activePartnerId, snapshot, catalog, baseLayers: clone(baseLayers) });
}

export function createOwnedPartnerCostumeItems({ snapshot, partnerId, catalog, category }) {
  const wantedCategory = requireId(category, 'category');
  if (!PARTNER_COSTUME_CATEGORIES.includes(wantedCategory)) fail(`unsupported costume category: ${wantedCategory}`);
  const state = requireObject(snapshot?.partners?.[requireId(partnerId, 'partnerId')], 'partner state');
  const ids = Array.isArray(state.ownedItemIds) ? state.ownedItemIds : [];
  return ids.flatMap((itemId) => {
    const item = catalog?.[itemId];
    if (!item || item.category !== wantedCategory) return [];
    const label = typeof item.label === 'string' && item.label.trim() ? item.label.trim()
      : typeof item.displayName === 'string' && item.displayName.trim() ? item.displayName.trim()
        : null;
    if (!label) return [];
    return [Object.freeze({ id: itemId, label, category: wantedCategory, setId: item.setId ?? null })];
  });
}

export function resolveOwnedRecommendedSet({ snapshot, partnerId, catalog, sourceItemId }) {
  const source = catalog?.[requireId(sourceItemId, 'sourceItemId')];
  if (!source || typeof source.setId !== 'string' || !source.setId.trim()) return null;
  const state = snapshot?.partners?.[requireId(partnerId, 'partnerId')];
  if (!state || !Array.isArray(state.ownedItemIds)) return null;
  const owned = new Set(state.ownedItemIds);
  const resolved = {};
  for (const category of PARTNER_COSTUME_CATEGORIES) {
    const matches = Object.entries(catalog || {}).filter(([id, item]) => (
      owned.has(id) && item?.category === category && item?.setId === source.setId
    ));
    if (matches.length !== 1) return null;
    resolved[category] = matches[0][0];
  }
  return Object.freeze(resolved);
}

function ensureStyle(document) {
  if (document.getElementById?.(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.grPartnerCostumeEntry{min-height:44px;padding:10px 16px;border:1px solid rgba(184,207,255,.28);border-radius:999px;background:rgba(50,66,116,.42);color:#f3f6ff;font:inherit;cursor:pointer;touch-action:manipulation}
.grPartnerCostumeOverlay{position:fixed;inset:0;z-index:2147482500;display:grid;place-items:center;padding:18px;background:rgba(5,9,22,.62);backdrop-filter:blur(5px)}
.grPartnerCostumePanel{width:min(980px,96vw);height:min(620px,92vh);display:grid;grid-template-columns:minmax(240px,42%) 1fr;gap:16px;padding:16px;border:1px solid rgba(194,214,255,.22);border-radius:24px;background:rgba(17,24,48,.97);color:#f4f7ff;box-shadow:0 24px 80px rgba(0,0,0,.45)}
.grPartnerCostumePreview{position:relative;min-height:300px;overflow:hidden;border-radius:18px;background:rgba(255,255,255,.05)}
.grPartnerCostumePreview img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none}
.grPartnerCostumePreviewFallback{position:absolute;inset:0;display:grid;place-items:center;padding:18px;text-align:center;color:#aeb7d9}
.grPartnerCostumeControls{min-width:0;display:flex;flex-direction:column;gap:12px}
.grPartnerCostumeHeader{display:flex;align-items:center;justify-content:space-between;gap:12px}
.grPartnerCostumeTitle{font-size:18px;font-weight:700}
.grPartnerCostumeClose,.grPartnerCostumeAction,.grPartnerCostumeCategory,.grPartnerCostumeItem{min-height:44px;border:1px solid rgba(184,207,255,.23);border-radius:13px;background:rgba(50,66,116,.34);color:inherit;font:inherit;cursor:pointer;touch-action:manipulation}
.grPartnerCostumeClose{min-width:44px;font-size:20px}
.grPartnerCostumeCategories,.grPartnerCostumeActions{display:flex;gap:8px;flex-wrap:wrap}
.grPartnerCostumeCategory,.grPartnerCostumeAction{padding:9px 14px}
.grPartnerCostumeCategory[aria-pressed="true"]{background:rgba(98,125,210,.52);border-color:rgba(179,202,255,.52)}
.grPartnerCostumeItems{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;overflow:auto;min-height:110px;max-height:250px;padding:2px}
.grPartnerCostumeItem{padding:10px;text-align:left}
.grPartnerCostumeItem[data-selected="true"]{background:rgba(98,125,210,.5);border-color:rgba(179,202,255,.56)}
.grPartnerCostumeStatus{min-height:20px;font-size:12px;color:#c9d3f5}
.grPartnerCostumeDetail{position:absolute;inset:0;z-index:2;display:grid;place-items:end center;padding:16px;background:rgba(6,10,24,.5)}
.grPartnerCostumeDetailCard{width:min(420px,100%);padding:16px;border-radius:16px;background:#18203f;border:1px solid rgba(194,214,255,.24)}
@media(max-width:720px){.grPartnerCostumePanel{grid-template-columns:42% 1fr;gap:10px;padding:10px}.grPartnerCostumePreview{min-height:240px}.grPartnerCostumeItems{max-height:190px}.grPartnerCostumeTitle{font-size:15px}}
`;
  document.head?.appendChild?.(style);
}

function findPartnerSurface(document) {
  for (const selector of PARTNER_SURFACE_SELECTORS) {
    const node = document.querySelector?.(selector);
    if (node) return node;
  }
  return null;
}

function renderPreview({ document, preview, baseLayers, catalog, selection }) {
  while (preview.firstChild) preview.removeChild?.(preview.firstChild);
  const layers = buildPartnerCostumeLayers({ baseLayers, catalog, selection });
  let rendered = 0;
  for (const layer of layers) {
    const src = typeof layer.src === 'string' && layer.src.trim() ? layer.src.trim() : null;
    if (!src) continue;
    const image = document.createElement('img');
    image.src = src;
    image.alt = '';
    image.dataset.costumeLayerSource = layer.source || '';
    image.dataset.costumeLayerZ = String(layer.z ?? 0);
    preview.appendChild?.(image);
    rendered += 1;
  }
  if (rendered === 0) {
    const fallback = document.createElement('div');
    fallback.className = 'grPartnerCostumePreviewFallback';
    fallback.textContent = '表示できる正式衣装素材がありません';
    preview.appendChild?.(fallback);
  }
  return rendered;
}

function makeButton(document, className, text) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = text;
  return button;
}

function removeNode(node) {
  if (typeof node?.remove === 'function') node.remove();
  else node?.parentNode?.removeChild?.(node);
}

function createRequestId(global) {
  const id = global?.crypto?.randomUUID?.();
  if (typeof id === 'string' && id) return id;
  return `costume-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function openCostumeOverlay(global, provider, canonical) {
  const document = global.document;
  removeNode(document.querySelector?.(OVERLAY_SELECTOR));

  let session = createPartnerCostumeSession({
    snapshot: canonical.snapshot,
    partnerId: canonical.activePartnerId,
    catalog: canonical.catalog,
  });
  let committedSnapshot = canonical.snapshot;
  let activeCategory = PARTNER_COSTUME_CATEGORIES[0];
  let lastTouchedItemId = null;
  let saveInFlight = false;

  const overlay = document.createElement('div');
  overlay.className = 'grPartnerCostumeOverlay';
  overlay.dataset.grPartnerCostumeOverlay = '1';
  overlay.setAttribute?.('role', 'dialog');
  overlay.setAttribute?.('aria-modal', 'true');
  overlay.setAttribute?.('aria-label', 'パートナー着せ替え');

  const panel = document.createElement('section');
  panel.className = 'grPartnerCostumePanel';
  overlay.appendChild?.(panel);

  const preview = document.createElement('div');
  preview.className = 'grPartnerCostumePreview';
  panel.appendChild?.(preview);

  const controls = document.createElement('div');
  controls.className = 'grPartnerCostumeControls';
  panel.appendChild?.(controls);

  const header = document.createElement('div');
  header.className = 'grPartnerCostumeHeader';
  const title = document.createElement('div');
  title.className = 'grPartnerCostumeTitle';
  title.textContent = '着せ替え';
  const close = makeButton(document, 'grPartnerCostumeClose', '×');
  close.setAttribute?.('aria-label', '着せ替えを閉じる');
  header.appendChild?.(title);
  header.appendChild?.(close);
  controls.appendChild?.(header);

  const categories = document.createElement('div');
  categories.className = 'grPartnerCostumeCategories';
  controls.appendChild?.(categories);

  const items = document.createElement('div');
  items.className = 'grPartnerCostumeItems';
  controls.appendChild?.(items);

  const actions = document.createElement('div');
  actions.className = 'grPartnerCostumeActions';
  const recommended = makeButton(document, 'grPartnerCostumeAction', 'おすすめ一式');
  const revert = makeButton(document, 'grPartnerCostumeAction', '元へ戻す');
  const save = makeButton(document, 'grPartnerCostumeAction', '保存');
  actions.appendChild?.(recommended);
  actions.appendChild?.(revert);
  actions.appendChild?.(save);
  controls.appendChild?.(actions);

  const status = document.createElement('div');
  status.className = 'grPartnerCostumeStatus';
  status.setAttribute?.('aria-live', 'polite');
  controls.appendChild?.(status);

  const closeDetail = () => removeNode(overlay.querySelector?.(DETAIL_SELECTOR));

  function showDetail(item) {
    closeDetail();
    const detail = document.createElement('div');
    detail.className = 'grPartnerCostumeDetail';
    detail.dataset.grPartnerCostumeDetail = '1';
    const card = document.createElement('div');
    card.className = 'grPartnerCostumeDetailCard';
    const name = document.createElement('strong');
    name.textContent = item.label ?? item.displayName ?? '';
    const description = document.createElement('div');
    description.textContent = typeof item.description === 'string' ? item.description : '';
    card.appendChild?.(name);
    card.appendChild?.(description);
    detail.appendChild?.(card);
    detail.addEventListener?.('click', (event) => {
      if (event.target === detail) closeDetail();
    });
    overlay.appendChild?.(detail);
  }

  function refreshPreview() {
    renderPreview({
      document,
      preview,
      baseLayers: canonical.baseLayers,
      catalog: canonical.catalog,
      selection: session.getDraftSelection(),
    });
  }

  function refreshItems() {
    while (items.firstChild) items.removeChild?.(items.firstChild);
    const owned = createOwnedPartnerCostumeItems({
      snapshot: committedSnapshot,
      partnerId: canonical.activePartnerId,
      catalog: canonical.catalog,
      category: activeCategory,
    });
    const selected = session.getDraftSelection()[activeCategory];
    for (const itemView of owned) {
      const button = makeButton(document, 'grPartnerCostumeItem', itemView.label);
      button.dataset.costumeItemId = itemView.id;
      button.dataset.selected = String(selected === itemView.id);
      button.addEventListener?.('click', () => {
        if (saveInFlight) return;
        const result = session.equip(activeCategory, itemView.id);
        lastTouchedItemId = itemView.id;
        if (result.action === 'DETAIL') showDetail(canonical.catalog[itemView.id]);
        else closeDetail();
        status.textContent = result.action === 'DETAIL' ? '詳細を表示しています' : '仮装備中';
        refreshPreview();
        refreshItems();
      });
      items.appendChild?.(button);
    }
    if (owned.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'grPartnerCostumeStatus';
      empty.textContent = 'この分類の所持衣装はありません';
      items.appendChild?.(empty);
    }
  }

  for (const category of PARTNER_COSTUME_CATEGORIES) {
    const button = makeButton(document, 'grPartnerCostumeCategory', CATEGORY_LABELS[category]);
    button.dataset.costumeCategory = category;
    button.setAttribute?.('aria-pressed', String(category === activeCategory));
    button.addEventListener?.('click', () => {
      if (saveInFlight) return;
      activeCategory = category;
      lastTouchedItemId = null;
      closeDetail();
      for (const child of categories.children || []) {
        child.setAttribute?.('aria-pressed', String(child.dataset?.costumeCategory === activeCategory));
      }
      refreshItems();
    });
    categories.appendChild?.(button);
  }

  recommended.addEventListener?.('click', () => {
    if (saveInFlight || !lastTouchedItemId) return;
    const set = resolveOwnedRecommendedSet({
      snapshot: committedSnapshot,
      partnerId: canonical.activePartnerId,
      catalog: canonical.catalog,
      sourceItemId: lastTouchedItemId,
    });
    if (!set) {
      status.textContent = '所持済み3点の一式が揃っていません';
      return;
    }
    session.equipRecommendedSet(set);
    status.textContent = 'おすすめ一式を仮装備中';
    closeDetail();
    refreshPreview();
    refreshItems();
  });

  revert.addEventListener?.('click', () => {
    if (saveInFlight) return;
    session.revert();
    lastTouchedItemId = null;
    status.textContent = '画面を開いた時の状態へ戻しました';
    closeDetail();
    refreshPreview();
    refreshItems();
  });

  save.addEventListener?.('click', async () => {
    if (saveInFlight) return;
    saveInFlight = true;
    save.disabled = true;
    status.textContent = '保存しています…';
    const requestId = createRequestId(global);
    const candidate = session.save({ requestId });
    try {
      const returned = await provider.saveState({
        activePartnerId: canonical.activePartnerId,
        snapshot: clone(candidate),
        requestId,
      });
      const saved = normalizePartnerCostumeProviderState(returned);
      if (saved.activePartnerId !== canonical.activePartnerId) fail('saved active partner changed unexpectedly');
      canonical = saved;
      committedSnapshot = saved.snapshot;
      session = createPartnerCostumeSession({
        snapshot: saved.snapshot,
        partnerId: saved.activePartnerId,
        catalog: saved.catalog,
      });
      status.textContent = '保存しました';
      closeDetail();
      refreshPreview();
      refreshItems();
    } catch (error) {
      session = createPartnerCostumeSession({
        snapshot: committedSnapshot,
        partnerId: canonical.activePartnerId,
        catalog: canonical.catalog,
      });
      status.textContent = '保存できませんでした。保存前の状態を維持しています';
      refreshPreview();
      refreshItems();
    } finally {
      saveInFlight = false;
      save.disabled = false;
    }
  });

  const dismiss = () => removeNode(overlay);
  close.addEventListener?.('click', dismiss);
  overlay.addEventListener?.('click', (event) => {
    if (event.target === overlay) dismiss();
  });
  const onKeyDown = (event) => {
    if (event.key !== 'Escape') return;
    if (overlay.querySelector?.(DETAIL_SELECTOR)) closeDetail();
    else dismiss();
  };
  global.addEventListener?.('keydown', onKeyDown);

  refreshPreview();
  refreshItems();
  document.body?.appendChild?.(overlay);
  return overlay;
}

export async function openPartnerCostumeFromCurrentBrowser(global = globalThis) {
  const provider = normalizeProvider(global);
  if (!provider) return Object.freeze({ opened: false, reason: 'canonical-costume-provider-missing' });
  try {
    const canonical = normalizePartnerCostumeProviderState(await provider.loadState());
    if (!findPartnerSurface(global.document)) return Object.freeze({ opened: false, reason: 'partner-surface-missing' });
    const overlay = openCostumeOverlay(global, provider, canonical);
    return Object.freeze({ opened: true, partnerId: canonical.activePartnerId, overlay });
  } catch (error) {
    return Object.freeze({ opened: false, reason: 'canonical-costume-state-invalid', error });
  }
}

export function projectPartnerCostumeEntry(global = globalThis) {
  const document = global?.document;
  if (!document?.querySelector || !document?.createElement) return 0;
  if (!normalizeProvider(global)) return 0;
  const surface = findPartnerSurface(document);
  if (!surface || surface.querySelector?.(ENTRY_SELECTOR)) return 0;
  ensureStyle(document);
  const button = makeButton(document, 'grPartnerCostumeEntry', '着せ替え');
  button.dataset.grPartnerCostumeEntry = '1';
  button.setAttribute?.('aria-label', 'パートナーを着せ替える');
  button.addEventListener?.('click', () => { void openPartnerCostumeFromCurrentBrowser(global); });
  surface.appendChild?.(button);
  return 1;
}

export function partnerCostumeRuntimePlan() {
  return Object.freeze({
    version: RUNTIME_VERSION,
    useSite: 'partner',
    categories: PARTNER_COSTUME_CATEGORIES.map((category) => ({ id: category, label: CATEGORY_LABELS[category] })),
    provisionalEquip: true,
    secondTapDetail: true,
    revertToOpeningState: true,
    saveOnlyViaCallerProvider: true,
    createsOwnershipAuthority: false,
    createsProductionSaveAuthority: false,
    fabricatesCatalogOrFormalAsset: false,
    minimumTouchTargetPx: 44,
  });
}

export function mountPartnerCostumeRuntime(global = globalThis) {
  const document = global?.document;
  const MutationObserverCtor = global?.MutationObserver;
  if (!document?.querySelector || !document?.createElement || typeof MutationObserverCtor !== 'function') return null;
  if (!normalizeProvider(global)) return null;

  const existing = global[RUNTIME_NAME];
  if (existing) {
    if (existing.version === RUNTIME_VERSION) return existing;
    throw new Error('PARTNER_COSTUME_RUNTIME_GLOBAL_COLLISION');
  }

  const project = () => projectPartnerCostumeEntry(global);
  const observer = new MutationObserverCtor(project);
  const observeTarget = document.body || document.documentElement;
  if (observeTarget) observer.observe(observeTarget, { childList: true, subtree: true });
  project();

  const runtime = Object.freeze({
    version: RUNTIME_VERSION,
    plan: partnerCostumeRuntimePlan(),
    project,
    open: () => openPartnerCostumeFromCurrentBrowser(global),
    disconnect: () => observer.disconnect?.(),
  });
  Object.defineProperty(global, RUNTIME_NAME, {
    configurable: false,
    enumerable: true,
    writable: false,
    value: runtime,
  });
  return runtime;
}

export const PARTNER_COSTUME_PROVIDER_NAME = PROVIDER_NAME;
export const PARTNER_COSTUME_RUNTIME_NAME = RUNTIME_NAME;
export const PARTNER_COSTUME_RUNTIME_VERSION = RUNTIME_VERSION;
