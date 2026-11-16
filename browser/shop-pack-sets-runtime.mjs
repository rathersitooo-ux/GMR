// Shop pack sets (#2 of GAMEROAD-ショップ実装表-20261112).
// Card packs: pick a set from the left column; the detail shows that set's
// price and guaranteed slot. Preview only: this module never claims
// purchase authority and never mutates ownership or saves.
// Price basis: the documented Shadowverse reference (1 pack = 500 Rupies)
// from the embedding doc's question list #8. Currency follows the #6
// ruling (Shadowverse-style, paid and free shown separately); ルピ is the
// free currency here. The per-set contents are not yet divided in code
// (no per-set pool data exists), so the preview draw stays shared; this
// module only changes which set is shown, not what the draw returns.

export const SHOP_PACK_SETS_SCHEMA = 'gameroad.shop-pack-sets.v1';
export const SHOP_PACK_SETS_STYLE_ID = 'gameroad-shop-pack-sets-r1';
export const DEFAULT_SHOP_PACK_SET_ID = 'set1';

export const SHOP_PACK_SETS = Object.freeze([
  Object.freeze({
    id: 'set1',
    title: '第1弾',
    description: '第1弾のパック',
    priceText: '1パック 500ルピ',
    guaranteedText: '7枠目：希少以上確定',
  }),
  Object.freeze({
    id: 'set2',
    title: '第2弾（恐竜）',
    description: '恐竜がメインの第2弾のパック',
    priceText: '1パック 500ルピ',
    guaranteedText: '7枠目：希少以上確定',
  }),
]);

export const SHOP_PACK_SETS_CSS = `
.gachaLayout.gachaLayoutWithPackSets{grid-template-columns:minmax(150px,.42fr) minmax(0,1.72fr) minmax(280px,.68fr)}
.gachaSetList{display:flex;flex-direction:column;gap:8px;min-height:0;overflow:auto}
.gachaSetButton{min-height:64px;padding:10px 12px;text-align:left;border:1px solid rgba(198,239,228,.22);background:linear-gradient(145deg,rgba(12,43,37,.96),rgba(5,19,17,.96));color:#e8f4ef;font-size:15px;font-weight:800;cursor:pointer}
.gachaSetButton[data-shop-pack-set-active="true"]{border-color:rgba(160,239,213,.62);box-shadow:0 18px 42px rgba(0,0,0,.24)}
.gachaPackSetDetail{margin:10px 0;padding:10px;border:1px solid rgba(198,239,228,.22);background:linear-gradient(145deg,rgba(12,43,37,.96),rgba(5,19,17,.96))}
.gachaPackSetTitle{font-size:clamp(18px,2.2vw,28px);font-weight:1000;line-height:1.1}
.gachaPackSetDescription{margin:6px 0 10px;color:#bfd4cd;font-size:11px;line-height:1.6}
.gachaPackSetPrice{font-size:15px;font-weight:800}
.gachaPackSetGuaranteed{margin-top:4px;color:#ffd07b;font-size:11px;font-weight:800}
@media(max-width:900px){.gachaLayout.gachaLayoutWithPackSets{grid-template-columns:minmax(120px,.5fr) minmax(0,1.4fr) minmax(220px,.8fr)}}
@media(max-width:540px) and (orientation:portrait){.gachaLayout.gachaLayoutWithPackSets{grid-template-columns:1fr}.gachaSetList{flex-direction:row}.gachaSetButton{flex:1}}
`;

export function projectShopPackSets() {
  return Object.freeze({
    schema: SHOP_PACK_SETS_SCHEMA,
    sets: SHOP_PACK_SETS,
    setIds: Object.freeze(SHOP_PACK_SETS.map((set) => set.id)),
    defaultSetId: DEFAULT_SHOP_PACK_SET_ID,
    purchaseAuthority: false,
    ownershipMutationAllowed: false,
    saveMutationAllowed: false,
  });
}

export function ensureShopPackSetsStyle(documentSource = globalThis.document) {
  if (!documentSource?.head || typeof documentSource.createElement !== 'function') return false;
  if (documentSource.getElementById?.(SHOP_PACK_SETS_STYLE_ID)) return false;
  const style = documentSource.createElement('style');
  style.id = SHOP_PACK_SETS_STYLE_ID;
  style.textContent = SHOP_PACK_SETS_CSS;
  if (typeof documentSource.head.appendChild === 'function') documentSource.head.appendChild(style);
  else documentSource.head.append?.(style);
  return true;
}

function findSet(id) {
  return SHOP_PACK_SETS.find((set) => set.id === id) || null;
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

function addClass(node, className) {
  if (!node) return;
  if (node.classList && typeof node.classList.add === 'function') node.classList.add(className);
  else if (typeof node.className === 'string' && !node.className.split(' ').includes(className)) {
    node.className = `${node.className} ${className}`.trim();
  }
}

const mountedByList = new WeakMap();

export function mountShopPackSetsRuntime({
  list,
  layout = null,
  titleNode = null,
  descriptionNode = null,
  priceNode = null,
  guaranteedNode = null,
  documentSource = globalThis.document,
} = {}) {
  if (!list || typeof list !== 'object' || childList(list).length === 0) {
    throw new Error('shop pack sets require a list node with children');
  }
  if (mountedByList.has(list)) return mountedByList.get(list);
  if (!documentSource || typeof documentSource.createElement !== 'function') {
    throw new Error('document source unavailable');
  }

  ensureShopPackSetsStyle(documentSource);
  addClass(layout, 'gachaLayoutWithPackSets');

  const buttons = collectNodes(list, (node) => typeof node?.dataset?.shopPackSet === 'string');

  let selectedSetId = null;

  function render(set) {
    if (titleNode) titleNode.textContent = set.title;
    if (descriptionNode) descriptionNode.textContent = set.description;
    if (priceNode) priceNode.textContent = set.priceText;
    if (guaranteedNode) guaranteedNode.textContent = set.guaranteedText;
    for (const button of buttons) {
      if (button.dataset.shopPackSet === set.id) button.dataset.shopPackSetActive = 'true';
      else delete button.dataset.shopPackSetActive;
    }
  }

  function selectSet(id) {
    const set = findSet(id);
    if (!set) return Object.freeze({ok: false, set: id, reason: 'unknown-set'});
    selectedSetId = set.id;
    render(set);
    return Object.freeze({ok: true, set: set.id, action: 'show-pack-set'});
  }

  for (const button of buttons) {
    if (typeof button.addEventListener === 'function') {
      button.addEventListener('click', () => selectSet(button.dataset.shopPackSet));
    }
  }

  selectSet(DEFAULT_SHOP_PACK_SET_ID);

  const runtime = Object.freeze({
    mounted: true,
    schema: SHOP_PACK_SETS_SCHEMA,
    projection: projectShopPackSets(),
    selectSet,
    getSelectedSetId: () => selectedSetId,
    purchaseAuthority: false,
    ownershipMutationAllowed: false,
    saveMutationAllowed: false,
  });
  mountedByList.set(list, runtime);
  return runtime;
}

export function ensureShopPackSetsRuntime(documentSource = globalThis.document) {
  if (!documentSource || typeof documentSource.querySelectorAll !== 'function' || typeof documentSource.createElement !== 'function' || typeof documentSource.getElementById !== 'function') return null;
  const gachaScreen = [...documentSource.querySelectorAll('.screen[data-screen]')]
    .find((candidate) => candidate?.dataset?.screen === 'gacha');
  if (!gachaScreen || typeof gachaScreen.querySelector !== 'function') return null;
  const list = documentSource.getElementById('shopPackSetList');
  if (!list) return null;
  const layout = gachaScreen.querySelector('.gachaLayout') || null;
  try {
    return mountShopPackSetsRuntime({
      list,
      layout,
      titleNode: documentSource.getElementById('shopPackSetTitle'),
      descriptionNode: documentSource.getElementById('shopPackSetDescription'),
      priceNode: documentSource.getElementById('shopPackSetPrice'),
      guaranteedNode: documentSource.getElementById('shopPackSetGuaranteed'),
      documentSource,
    });
  } catch {
    return null;
  }
}
