import { PARTNER_COSTUME_CATEGORIES } from './partner-costume-core.mjs';

const CATEGORY_LABELS = Object.freeze({ shoes: 'シューズ', coord: 'コーデ', accessory: 'アクセ' });

function fail(message) { throw new TypeError(message); }
function fn(value, label) { if (typeof value !== 'function') fail(`${label} must be a function`); return value; }
function obj(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`); return value; }
function id(value, label) { if (typeof value !== 'string' || value.trim() === '') fail(`${label} must be a non-empty string`); return value.trim(); }

export function mountPartnerCostumeScreen({
  root,
  document: doc = globalThis.document,
  sessionRuntime,
  catalog = {},
  getOwnedItemIds,
  getRecommendedSet = () => null,
  renderPreview = () => false,
  createSaveRequestId,
  onClose = () => {},
} = {}) {
  if (!root || typeof root.append !== 'function') fail('root must be a mountable element');
  if (!doc || typeof doc.createElement !== 'function') fail('document must support createElement');
  obj(sessionRuntime, 'sessionRuntime');
  const ownedIds = fn(getOwnedItemIds, 'getOwnedItemIds');
  const requestId = fn(createSaveRequestId, 'createSaveRequestId');
  fn(getRecommendedSet, 'getRecommendedSet');
  fn(renderPreview, 'renderPreview');
  fn(onClose, 'onClose');

  let activeCategory = 'coord';
  let detailItemId = null;
  let destroyed = false;

  const shell = doc.createElement('section');
  shell.dataset.gameroadPartnerCostume = 'screen';
  const preview = doc.createElement('div');
  preview.dataset.costumePreview = 'true';
  const fallback = doc.createElement('p');
  fallback.textContent = '基本の姿を表示中';
  preview.append(fallback);
  const categories = doc.createElement('nav');
  const items = doc.createElement('div');
  items.dataset.costumeItems = 'true';
  const actions = doc.createElement('div');
  const detail = doc.createElement('dialog');
  detail.dataset.costumeDetail = 'true';
  const message = doc.createElement('p');
  message.dataset.costumeMessage = 'true';

  function button(text, action) {
    const el = doc.createElement('button');
    el.type = 'button';
    el.textContent = text;
    el.addEventListener('click', action);
    return el;
  }

  const revertButton = button('元へ戻す', () => { sessionRuntime.revert(); detailItemId = null; render(); });
  const recommendedButton = button('おすすめ一式', () => {
    const set = getRecommendedSet(sessionRuntime.getView().partnerId);
    if (set) sessionRuntime.equipRecommendedSet(set);
    render();
  });
  const saveButton = button('保存', async () => {
    saveButton.disabled = true;
    message.textContent = '';
    try {
      await sessionRuntime.save({ requestId: id(requestId(), 'save request id') });
      message.textContent = '保存しました';
    } catch {
      message.textContent = '保存できませんでした。変更内容はこの画面に残っています';
    } finally {
      if (!destroyed) { saveButton.disabled = false; render(); }
    }
  });
  const closeButton = button('戻る', () => onClose());
  actions.append(revertButton, recommendedButton, saveButton, closeButton);

  for (const category of PARTNER_COSTUME_CATEGORIES) {
    const tab = button(CATEGORY_LABELS[category], () => { activeCategory = category; detailItemId = null; render(); });
    tab.dataset.costumeCategory = category;
    categories.append(tab);
  }

  detail.addEventListener('click', (event) => {
    if (event.target === detail) { detailItemId = null; if (typeof detail.close === 'function') detail.close(); render(); }
  });
  shell.append(preview, categories, items, actions, message, detail);
  root.append(shell);

  function currentOwnedCatalog(view) {
    const raw = ownedIds(view.partnerId);
    if (!Array.isArray(raw)) fail('getOwnedItemIds must return an array');
    return raw.map((value) => id(value, 'owned costume item id'))
      .map((itemId) => catalog[itemId])
      .filter((item) => item && item.category === activeCategory);
  }

  function render() {
    if (destroyed) return;
    const view = sessionRuntime.getView();
    fallback.hidden = renderPreview({ root: preview, view, catalog }) === true;
    items.replaceChildren();
    const owned = currentOwnedCatalog(view);
    if (owned.length === 0) {
      const empty = doc.createElement('p');
      empty.textContent = 'この分類で使える衣装はありません';
      items.append(empty);
    } else {
      for (const item of owned) {
        const itemId = id(item.id, 'catalog item id');
        const itemButton = button(item.label ?? '衣装', () => {
          const result = sessionRuntime.equip(activeCategory, itemId);
          if (result.action === 'DETAIL') detailItemId = itemId;
          render();
        });
        itemButton.dataset.costumeItemId = itemId;
        itemButton.dataset.selected = String(view.draftSelection[activeCategory] === itemId);
        items.append(itemButton);
      }
    }
    const selectedDetail = detailItemId ? catalog[detailItemId] : null;
    if (selectedDetail) {
      detail.replaceChildren();
      const title = doc.createElement('p');
      title.textContent = selectedDetail.label ?? '衣装の詳細';
      detail.append(title, button('閉じる', () => { detailItemId = null; if (typeof detail.close === 'function') detail.close(); render(); }));
      if (typeof detail.showModal === 'function' && !detail.open) detail.showModal();
    } else if (detail.open && typeof detail.close === 'function') detail.close();
    saveButton.disabled = view.saving === true;
  }

  return Object.freeze({
    async start() { await sessionRuntime.start(); render(); return sessionRuntime.getView(); },
    render,
    destroy() { destroyed = true; if (typeof shell.remove === 'function') shell.remove(); },
  });
}
