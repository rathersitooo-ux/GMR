const HOME_SELECTOR = 'section[data-screen="home"]';
const HOME_ROUTE_SELECTOR = '.homePadChoice[data-home-target]';
const QUICK_SETTINGS_OVERLAY_SELECTOR = '[data-gameroad-quick-settings][data-surface="home"]';
const EDITOR_ATTR = 'data-home-quick-set-settings-editor';
const STYLE_ID = 'gameroad-home-quickset-settings-style-r4';
const ITEM_SIZE_PX = 56;

const sessionPreference = {
  order: [],
  defaultId: null,
};

const ROUTE_LABELS = Object.freeze({
  setup: '対戦',
  battle: '対戦',
  shop: 'ショップ',
  partner: 'パートナー',
  characters: 'パートナー',
  cards: 'カード',
});

function cleanId(value) {
  return String(value ?? '').trim();
}

function cleanLabel(value, id) {
  const known = ROUTE_LABELS[id];
  if (known) return known;
  const label = String(value ?? '').trim();
  return label || id;
}

export function normalizeHomeQuickSetItems(items = []) {
  if (!Array.isArray(items)) return Object.freeze([]);
  const seen = new Set();
  const normalized = [];
  for (const source of items) {
    const id = cleanId(source?.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    normalized.push(Object.freeze({
      id,
      label: cleanLabel(source?.label, id),
      available: source?.available !== false,
    }));
  }
  return Object.freeze(normalized);
}

function normalizeOrder(order, validIds) {
  const result = [];
  const seen = new Set();
  for (const value of Array.isArray(order) ? order : []) {
    const id = cleanId(value);
    if (!id || seen.has(id) || !validIds.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

export function resolveHomeQuickSetConfiguration({ items = [], fallbackSelectedId = null, preference = sessionPreference } = {}) {
  const normalized = normalizeHomeQuickSetItems(items);
  const byId = new Map(normalized.map((item) => [item.id, item]));
  const validIds = new Set(byId.keys());
  const preferredOrder = normalizeOrder(preference?.order, validIds);
  const missing = normalized.map((item) => item.id).filter((id) => !preferredOrder.includes(id));
  const order = [...preferredOrder, ...missing];
  const orderedItems = order.map((id) => byId.get(id)).filter(Boolean);
  const preferredDefault = cleanId(preference?.defaultId);
  const fallback = cleanId(fallbackSelectedId);
  const selectedRouteId = validIds.has(preferredDefault)
    ? preferredDefault
    : validIds.has(fallback)
      ? fallback
      : orderedItems[0]?.id ?? null;
  return Object.freeze({
    items: Object.freeze(orderedItems),
    order: Object.freeze(order),
    selectedRouteId,
    persistence: 'session-only',
  });
}

export function swapHomeQuickSetOrder(order = [], firstId, secondId) {
  const ids = Array.isArray(order) ? order.map(cleanId).filter(Boolean) : [];
  const a = ids.indexOf(cleanId(firstId));
  const b = ids.indexOf(cleanId(secondId));
  if (a < 0 || b < 0 || a === b) return Object.freeze([...ids]);
  const next = [...ids];
  [next[a], next[b]] = [next[b], next[a]];
  return Object.freeze(next);
}

export function setHomeQuickSetSessionPreference({ order, defaultId } = {}) {
  if (Array.isArray(order)) sessionPreference.order = order.map(cleanId).filter(Boolean);
  if (defaultId !== undefined) sessionPreference.defaultId = cleanId(defaultId) || null;
  return getHomeQuickSetSessionPreference();
}

export function getHomeQuickSetSessionPreference() {
  return Object.freeze({
    order: Object.freeze([...sessionPreference.order]),
    defaultId: sessionPreference.defaultId,
    persistence: 'session-only',
  });
}

export function resetHomeQuickSetSessionPreference() {
  sessionPreference.order = [];
  sessionPreference.defaultId = null;
  return getHomeQuickSetSessionPreference();
}

function routeItemsFromDocument(documentSource) {
  const home = documentSource?.querySelector?.(HOME_SELECTOR);
  if (!home) return Object.freeze([]);
  const items = [...home.querySelectorAll?.(HOME_ROUTE_SELECTOR) ?? []].map((button) => ({
    id: button?.dataset?.homeTarget,
    label: button?.getAttribute?.('aria-label') || button?.textContent,
    available: button?.disabled !== true && button?.getAttribute?.('aria-disabled') !== 'true',
  }));
  return normalizeHomeQuickSetItems(items);
}

function ensureEditorStyle(documentSource) {
  if (!documentSource?.head || documentSource.getElementById?.(STYLE_ID)) return;
  const style = documentSource.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
[${EDITOR_ATTR}]{display:grid;gap:9px;padding:10px;border:1px solid rgba(255,255,255,.15);border-radius:14px;background:rgba(255,255,255,.035)}
[${EDITOR_ATTR}] h3{margin:0;font-size:14px}
[${EDITOR_ATTR}] .grHomeQuickSetHint{margin:0;font-size:11px;line-height:1.45;opacity:.72}
[${EDITOR_ATTR}] .grHomeQuickSetItems{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
[${EDITOR_ATTR}] .grHomeQuickSetItem{position:relative;box-sizing:border-box;width:${ITEM_SIZE_PX}px!important;height:${ITEM_SIZE_PX}px!important;min-width:${ITEM_SIZE_PX}px!important;min-height:${ITEM_SIZE_PX}px!important;padding:5px!important;border-radius:50%!important;display:grid!important;place-items:center!important;text-align:center;font-size:10px!important;line-height:1.05!important;overflow:hidden}
[${EDITOR_ATTR}] .grHomeQuickSetItem[data-selected="true"]{outline:3px solid currentColor;outline-offset:2px;filter:brightness(1.14)}
[${EDITOR_ATTR}] .grHomeQuickSetItem[data-default="true"]::after{content:"最初";position:absolute;right:-2px;bottom:-2px;padding:2px 4px;border-radius:999px;background:#fff;color:#111;font-size:8px;font-weight:900;line-height:1}
[${EDITOR_ATTR}] .grHomeQuickSetItem[data-available="false"]{opacity:.38;filter:grayscale(.55) brightness(.7)}
[${EDITOR_ATTR}] .grHomeQuickSetActions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
[${EDITOR_ATTR}] .grHomeQuickSetSessionNote{margin:0;font-size:10px;opacity:.62}
`;
  documentSource.head.append(style);
}

function editorNode(documentSource, tag, className = '', text = '') {
  const node = documentSource.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

export function mountHomeQuickSetSettingsEditor(documentSource = globalThis.document) {
  const overlay = documentSource?.querySelector?.(QUICK_SETTINGS_OVERLAY_SELECTOR);
  if (!overlay || typeof documentSource?.createElement !== 'function') return false;
  if (overlay.querySelector?.(`[${EDITOR_ATTR}]`)) return true;
  const panel = overlay.querySelector?.('.grSharedQuickSettingsPanel');
  if (!panel) return false;
  const actualItems = routeItemsFromDocument(documentSource);
  if (!actualItems.length) return false;
  ensureEditorStyle(documentSource);

  const editor = editorNode(documentSource, 'section');
  editor.setAttribute(EDITOR_ATTR, '1');
  editor.append(editorNode(documentSource, 'h3', '', 'クイックセット'));
  editor.append(editorNode(documentSource, 'p', 'grHomeQuickSetHint', '丸を2つ押すと位置を入れ替えます。選んだ丸を「最初」にすると、スライドパッドを押したまま動かさず離した時の項目になります。'));
  const itemsHost = editorNode(documentSource, 'div', 'grHomeQuickSetItems');
  const actions = editorNode(documentSource, 'div', 'grHomeQuickSetActions');
  const makeDefault = editorNode(documentSource, 'button', '', '選んだ丸を最初にする');
  makeDefault.type = 'button';
  const reset = editorNode(documentSource, 'button', '', '並びを元に戻す');
  reset.type = 'button';
  actions.append(makeDefault, reset);
  editor.append(itemsHost, actions);
  editor.append(editorNode(documentSource, 'p', 'grHomeQuickSetSessionNote', 'この版では起動中だけ反映します。保存方法は既存の設定保存先が確認できるまで増やしません。'));

  let selectedId = null;
  const actualIds = actualItems.map((item) => item.id);

  const render = () => {
    const resolved = resolveHomeQuickSetConfiguration({ items: actualItems, preference: sessionPreference });
    itemsHost.replaceChildren(...resolved.items.map((item) => {
      const button = editorNode(documentSource, 'button', 'grHomeQuickSetItem', item.label);
      button.type = 'button';
      button.dataset.quickSetItemId = item.id;
      button.dataset.selected = selectedId === item.id ? 'true' : 'false';
      button.dataset.default = resolved.selectedRouteId === item.id ? 'true' : 'false';
      button.dataset.available = item.available ? 'true' : 'false';
      button.setAttribute('aria-label', `${item.label}${resolved.selectedRouteId === item.id ? '・最初' : ''}`);
      button.addEventListener('click', () => {
        if (!selectedId) {
          selectedId = item.id;
          render();
          return;
        }
        if (selectedId === item.id) {
          selectedId = null;
          render();
          return;
        }
        const current = resolveHomeQuickSetConfiguration({ items: actualItems, preference: sessionPreference });
        const nextOrder = swapHomeQuickSetOrder(current.order, selectedId, item.id);
        setHomeQuickSetSessionPreference({ order: nextOrder });
        selectedId = item.id;
        render();
      });
      return button;
    }));
  };

  makeDefault.addEventListener('click', () => {
    if (!selectedId || !actualIds.includes(selectedId)) return;
    setHomeQuickSetSessionPreference({ defaultId: selectedId });
    render();
  });
  reset.addEventListener('click', () => {
    resetHomeQuickSetSessionPreference();
    selectedId = null;
    render();
  });

  const details = panel.querySelector?.('.grSharedQuickSettingsDetails');
  if (details?.parentNode === panel) panel.insertBefore(editor, details);
  else panel.append(editor);
  render();
  return true;
}

function scheduleEditorMount(documentSource) {
  const schedule = typeof queueMicrotask === 'function' ? queueMicrotask : (fn) => Promise.resolve().then(fn);
  schedule(() => mountHomeQuickSetSettingsEditor(documentSource));
}

function installEditorEntry(documentSource) {
  if (!documentSource?.addEventListener) return false;
  documentSource.addEventListener('click', (event) => {
    const target = event?.target;
    if (!target || typeof target.closest !== 'function') return;
    const home = target.closest(HOME_SELECTOR);
    if (!home) return;
    const settings = target.closest('.homeUtilityBtn,[data-home-target="settings"],[data-go="settings"],[data-root-go="settings"]');
    if (!settings || !home.contains?.(settings)) return;
    const values = [settings?.dataset?.homeTarget, settings?.dataset?.go, settings?.dataset?.rootGo].map((value) => cleanId(value).toLowerCase());
    const label = String(settings?.getAttribute?.('aria-label') || settings?.textContent || '').trim();
    if (!values.includes('settings') && !label.includes('設定')) return;
    scheduleEditorMount(documentSource);
  }, true);
  return true;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  installEditorEntry(document);
  globalThis.GAMEROAD_HOME_QUICKSET_SETTINGS = Object.freeze({
    read: getHomeQuickSetSessionPreference,
    set: setHomeQuickSetSessionPreference,
    reset: resetHomeQuickSetSessionPreference,
    resolve: resolveHomeQuickSetConfiguration,
    mountEditor: mountHomeQuickSetSettingsEditor,
    persistence: 'session-only',
  });
}
