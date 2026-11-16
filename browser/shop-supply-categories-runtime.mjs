// Shop supply categories (#3 of GAMEROAD-ショップ実装表-20261112).
// The supply list is the formal catalog already mounted below the shop
// entry grid. This module adds the category switch on top of it:
// すべて / スリーブ / エンブレム / ホーム背景 / カードスタイル / ファンアート.
// It only shows and hides what the catalog already rendered; it never
// invents products, never claims purchase authority and never mutates
// ownership or saves. A category with no items shows an empty note
// instead of an empty list. The catalog host is rebuilt on every visit
// to the shop screen, so mounting checks that the tab bar is still
// attached and rebuilds it when the host was replaced.

export const SHOP_SUPPLY_CATEGORIES_SCHEMA = 'gameroad.shop-supply-categories.v1';
export const SHOP_SUPPLY_CATEGORIES_STYLE_ID = 'gameroad-shop-supply-categories-r1';
export const DEFAULT_SHOP_SUPPLY_CATEGORY_ID = 'all';
export const SHOP_SUPPLY_CATEGORY_EMPTY_TEXT = 'このカテゴリにはまだ商品がありません';

export const SHOP_SUPPLY_CATEGORIES = Object.freeze([
  Object.freeze({id: 'all', title: 'すべて'}),
  Object.freeze({id: 'sleeve', title: 'スリーブ'}),
  Object.freeze({id: 'emblem', title: 'エンブレム'}),
  Object.freeze({id: 'home-background', title: 'ホーム背景'}),
  Object.freeze({id: 'card-style', title: 'カードスタイル'}),
  Object.freeze({id: 'fanart', title: 'ファンアート'}),
]);

export const SHOP_SUPPLY_CATEGORIES_CSS = `
.shopSupplyCategoryBar{display:flex;gap:8px;overflow-x:auto;padding:2px 2px 10px;scrollbar-width:thin}
.shopSupplyCategoryButton{flex:0 0 auto;min-height:44px;padding:10px 14px;border:1px solid rgba(198,239,228,.22);border-radius:999px;background:linear-gradient(145deg,rgba(12,43,37,.96),rgba(5,19,17,.96));color:#e8f4ef;font-size:14px;font-weight:800;cursor:pointer;white-space:nowrap}
.shopSupplyCategoryButton[data-shop-supply-category-active="true"]{border-color:rgba(160,239,213,.62);box-shadow:0 18px 42px rgba(0,0,0,.24)}
.shopSupplyCategoryEmpty{margin:12px 0 0}
.shopSupplyCategoryEmpty[hidden]{display:none}
/* The live catalog sets display:grid on cards and sections, which beats
   the user-agent [hidden] rule, so hiding needs these explicit rules. */
.shopFormalCatalogHost .shopLiveCatalogCard[hidden]{display:none}
.shopFormalCatalogHost .shopLiveCatalogSection[hidden]{display:none}
@media(max-width:540px) and (orientation:portrait){.shopSupplyCategoryButton{min-height:40px;padding:8px 12px;font-size:13px}}
`;

export function projectShopSupplyCategories() {
  return Object.freeze({
    schema: SHOP_SUPPLY_CATEGORIES_SCHEMA,
    categories: SHOP_SUPPLY_CATEGORIES,
    categoryIds: Object.freeze(SHOP_SUPPLY_CATEGORIES.map((category) => category.id)),
    defaultCategoryId: DEFAULT_SHOP_SUPPLY_CATEGORY_ID,
    emptyText: SHOP_SUPPLY_CATEGORY_EMPTY_TEXT,
    purchaseAuthority: false,
    ownershipMutationAllowed: false,
    saveMutationAllowed: false,
  });
}

export function ensureShopSupplyCategoriesStyle(documentSource = globalThis.document) {
  if (!documentSource?.head || typeof documentSource.createElement !== 'function') return false;
  if (documentSource.getElementById?.(SHOP_SUPPLY_CATEGORIES_STYLE_ID)) return false;
  const style = documentSource.createElement('style');
  style.id = SHOP_SUPPLY_CATEGORIES_STYLE_ID;
  style.textContent = SHOP_SUPPLY_CATEGORIES_CSS;
  if (typeof documentSource.head.appendChild === 'function') documentSource.head.appendChild(style);
  else documentSource.head.append?.(style);
  return true;
}

// Which supply categories a rendered catalog card belongs to, from the
// item the live catalog projected. Only facts the catalog already holds
// are used: a fan-art work is a ファンアート item, and one whose use site
// is a card sleeve is also a スリーブ item. Formal supply items with a
// sleeve use site are スリーブ items. Anything else has no known supply
// sub-category yet, so it stays under すべて only; no category is guessed.
export function supplyCategoriesForCatalogItem(item) {
  if (!item || typeof item !== 'object') return Object.freeze([]);
  const categories = new Set();
  if (item.kind === 'FANART') {
    categories.add('fanart');
    if (item.targetUseSite === 'CARD_SLEEVE') categories.add('sleeve');
  } else if (item.kind === 'SUPPLY') {
    if (item.targetUseSite === 'CARD_SLEEVE') categories.add('sleeve');
  }
  return Object.freeze([...categories]);
}

function findCategory(id) {
  return SHOP_SUPPLY_CATEGORIES.find((category) => category.id === id) || null;
}

function childList(node) {
  if (!node || typeof node.children === 'undefined' || node.children === null) return [];
  if (Array.isArray(node.children)) return node.children;
  // Real DOM children is an HTMLCollection, not an Array.
  if (typeof node.children.length === 'number') return Array.from(node.children);
  return [];
}

function collectNodes(root, predicate) {
  const found = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (predicate(node)) found.push(node);
    for (const child of childList(node)) visit(child);
  };
  visit(root);
  return found;
}

function hasClass(node, className) {
  if (!node) return false;
  if (node.classList && typeof node.classList.contains === 'function') {
    try {
      if (node.classList.contains(className)) return true;
    } catch { /* fall through to the className string */ }
  }
  return typeof node.className === 'string' && node.className.split(' ').includes(className);
}

function cardCategories(card) {
  const raw = card?.dataset?.shopSupplyCategories;
  if (typeof raw !== 'string' || raw.trim() === '') return [];
  return raw.trim().split(/\s+/);
}

function appendText(documentSource, parent, tagName, className, text) {
  const node = documentSource.createElement(tagName);
  if (className) node.className = className;
  node.textContent = text;
  parent.appendChild(node);
  return node;
}

const mountedByHost = new WeakMap();

export function mountShopSupplyCategoriesRuntime({
  host,
  documentSource = globalThis.document,
} = {}) {
  if (!host || typeof host !== 'object') {
    throw new Error('shop supply categories require a host node');
  }
  const existing = mountedByHost.get(host);
  if (existing && existing.getTabBar?.()?.parentNode === host) return existing;
  if (!documentSource || typeof documentSource.createElement !== 'function') {
    throw new Error('document source unavailable');
  }

  const cards = collectNodes(host, (node) => typeof node?.dataset?.shopItemIdentity === 'string');
  if (cards.length === 0) {
    return Object.freeze({
      mounted: false,
      reason: 'empty-catalog',
      schema: SHOP_SUPPLY_CATEGORIES_SCHEMA,
      projection: projectShopSupplyCategories(),
      purchaseAuthority: false,
      ownershipMutationAllowed: false,
      saveMutationAllowed: false,
    });
  }

  ensureShopSupplyCategoriesStyle(documentSource);

  const sections = collectNodes(host, (node) => hasClass(node, 'shopLiveCatalogSection'));
  const bar = documentSource.createElement('div');
  bar.className = 'shopSupplyCategoryBar';
  bar.setAttribute?.('role', 'tablist');
  bar.setAttribute?.('aria-label', 'サプライのカテゴリ');
  const buttons = SHOP_SUPPLY_CATEGORIES.map((category) => {
    const button = documentSource.createElement('button');
    button.type = 'button';
    button.className = 'shopSupplyCategoryButton';
    button.dataset.shopSupplyCategory = category.id;
    button.textContent = category.title;
    bar.appendChild(button);
    return button;
  });

  const emptyNote = documentSource.createElement('p');
  emptyNote.className = 'safeNote shopSupplyCategoryEmpty';
  emptyNote.textContent = SHOP_SUPPLY_CATEGORY_EMPTY_TEXT;
  emptyNote.hidden = true;

  if (typeof host.insertBefore === 'function' && host.firstChild) host.insertBefore(bar, host.firstChild);
  else if (typeof host.appendChild === 'function') host.appendChild(bar);
  else if (typeof host.append === 'function') host.append(bar);
  if (typeof host.appendChild === 'function') host.appendChild(emptyNote);
  else if (typeof host.append === 'function') host.append(emptyNote);

  let selectedCategoryId = null;

  function cardVisibleIn(card, categoryId) {
    if (categoryId === DEFAULT_SHOP_SUPPLY_CATEGORY_ID) return true;
    return cardCategories(card).includes(categoryId);
  }

  function render(category) {
    let visibleCount = 0;
    for (const card of cards) {
      const visible = cardVisibleIn(card, category.id);
      card.hidden = !visible;
      if (visible) visibleCount += 1;
    }
    for (const section of sections) {
      const sectionCards = collectNodes(section, (node) => typeof node?.dataset?.shopItemIdentity === 'string');
      section.hidden = !sectionCards.some((card) => !card.hidden);
    }
    emptyNote.hidden = visibleCount > 0;
    for (const button of buttons) {
      if (button.dataset.shopSupplyCategory === category.id) button.dataset.shopSupplyCategoryActive = 'true';
      else delete button.dataset.shopSupplyCategoryActive;
    }
    return visibleCount;
  }

  function selectCategory(id) {
    const category = findCategory(id);
    if (!category) return Object.freeze({ok: false, category: id, reason: 'unknown-category'});
    selectedCategoryId = category.id;
    const visibleCount = render(category);
    return Object.freeze({ok: true, category: category.id, action: 'show-supply-category', visibleCount});
  }

  for (const button of buttons) {
    if (typeof button.addEventListener === 'function') {
      button.addEventListener('click', () => selectCategory(button.dataset.shopSupplyCategory));
    }
  }

  selectCategory(DEFAULT_SHOP_SUPPLY_CATEGORY_ID);

  const runtime = Object.freeze({
    mounted: true,
    schema: SHOP_SUPPLY_CATEGORIES_SCHEMA,
    projection: projectShopSupplyCategories(),
    selectCategory,
    getSelectedCategoryId: () => selectedCategoryId,
    getTabBar: () => bar,
    getVisibleCount: () => cards.filter((card) => !card.hidden).length,
    purchaseAuthority: false,
    ownershipMutationAllowed: false,
    saveMutationAllowed: false,
  });
  mountedByHost.set(host, runtime);
  return runtime;
}

export function ensureShopSupplyCategoriesRuntime(documentSource = globalThis.document) {
  if (!documentSource || typeof documentSource.querySelectorAll !== 'function' || typeof documentSource.createElement !== 'function' || typeof documentSource.getElementById !== 'function') return null;
  const shopScreen = [...documentSource.querySelectorAll('.screen[data-screen]')]
    .find((candidate) => candidate?.dataset?.screen === 'shop');
  if (!shopScreen || typeof shopScreen.querySelector !== 'function') return null;
  const host = shopScreen.querySelector('#shopFormalCatalog');
  if (!host) return null;
  try {
    return mountShopSupplyCategoriesRuntime({host, documentSource});
  } catch {
    return null;
  }
}
