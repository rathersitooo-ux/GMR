// Shop entry branches (#1 of GAMEROAD-ショップ実装表-20261112).
// Entering Shop divides into four branches: pack / supply / charge / exchange.
// Pack already has its route (gacha preview). Supply shows the formal catalog
// already mounted below the grid. Charge shows the charge place mounted by
// shop-charge-runtime.mjs (#4). Exchange shows the exchange place mounted by
// shop-exchange-runtime.mjs (#5). This module never claims purchase authority
// and never mutates ownership or saves.

export const SHOP_ENTRY_BRANCHES_SCHEMA = 'gameroad.shop-entry-branches.v1';
export const SHOP_ENTRY_BRANCHES_STYLE_ID = 'gameroad-shop-entry-branches-r1';
export const SHOP_ENTRY_BRANCH_PENDING_NOTE = '準備中です';
export const SHOP_ENTRY_BRANCH_BACK_LABEL = '入口へ戻る';

export const SHOP_ENTRY_BRANCHES = Object.freeze([
  Object.freeze({id:'pack', title:'カードパック', description:'第1弾・第2弾のパック', target:'gacha', ready:true}),
  Object.freeze({id:'supply', title:'サプライ', description:'スリーブ・ファンアートなど', target:'catalog', ready:true}),
  Object.freeze({id:'charge', title:'課金', description:'クリスタル・バンドル', target:'charge', ready:true}),
  Object.freeze({id:'exchange', title:'交換', description:'チケット・イベント交換', target:'exchange', ready:true}),
]);

export const SHOP_ENTRY_BRANCHES_CSS = `
.shopGrid.shopEntryBranches{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr))}
.shopGrid.shopEntryBranches .shopCardPack{grid-row:auto}
.shopBranchCard[data-shop-branch-active="true"]{border-color:rgba(160,239,213,.62);box-shadow:0 18px 42px rgba(0,0,0,.24)}
.shopBranchView{margin-top:12px;padding:16px;border:1px solid rgba(198,239,228,.22);background:linear-gradient(145deg,rgba(12,43,37,.96),rgba(5,19,17,.96))}
.shopBranchView[hidden]{display:none}
.shopBranchViewTitle{margin:0 0 6px;font-size:clamp(18px,2.2vw,28px);line-height:1.1}
.shopBranchViewNote{margin:0 0 12px;color:#bfd4cd;font-size:11px;line-height:1.6}
@media(max-width:540px) and (orientation:portrait){.shopGrid.shopEntryBranches{grid-template-columns:1fr;grid-template-rows:auto}}
`;

export function projectShopEntryBranches() {
  return Object.freeze({
    schema:SHOP_ENTRY_BRANCHES_SCHEMA,
    branches:SHOP_ENTRY_BRANCHES,
    readyBranchIds:Object.freeze(SHOP_ENTRY_BRANCHES.filter((branch)=>branch.ready).map((branch)=>branch.id)),
    pendingBranchIds:Object.freeze(SHOP_ENTRY_BRANCHES.filter((branch)=>!branch.ready).map((branch)=>branch.id)),
    purchaseAuthority:false,
    ownershipMutationAllowed:false,
    saveMutationAllowed:false,
  });
}

export function ensureShopEntryBranchesStyle(documentSource = globalThis.document) {
  if (!documentSource?.head || typeof documentSource.createElement !== 'function') return false;
  if (documentSource.getElementById?.(SHOP_ENTRY_BRANCHES_STYLE_ID)) return false;
  const style = documentSource.createElement('style');
  style.id = SHOP_ENTRY_BRANCHES_STYLE_ID;
  style.textContent = SHOP_ENTRY_BRANCHES_CSS;
  if (typeof documentSource.head.appendChild === 'function') documentSource.head.appendChild(style);
  else documentSource.head.append?.(style);
  return true;
}

function findBranch(id) {
  return SHOP_ENTRY_BRANCHES.find((branch)=>branch.id === id) || null;
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

function scrollIntoViewIfPossible(node) {
  if (node && typeof node.scrollIntoView === 'function') {
    try { node.scrollIntoView(); } catch { /* scrolling is best-effort */ }
  }
}

function appendText(documentSource, parent, tagName, className, text) {
  const node = documentSource.createElement(tagName);
  if (className) node.className = className;
  node.textContent = text;
  parent.appendChild(node);
  return node;
}

const mountedByGrid = new WeakMap();

export function mountShopEntryBranchesRuntime({
  grid,
  panel = null,
  catalogHost = null,
  chargeHost = null,
  exchangeHost = null,
  documentSource = globalThis.document,
} = {}) {
  if (!grid || typeof grid !== 'object' || childList(grid).length === 0) {
    throw new Error('shop entry branches require a grid node with children');
  }
  if (mountedByGrid.has(grid)) return mountedByGrid.get(grid);
  if (!documentSource || typeof documentSource.createElement !== 'function') {
    throw new Error('document source unavailable');
  }

  ensureShopEntryBranchesStyle(documentSource);

  const cards = collectNodes(grid, (node)=>typeof node?.dataset?.shopBranch === 'string');
  const openButtons = collectNodes(grid, (node)=>typeof node?.dataset?.shopBranchOpen === 'string');

  const view = documentSource.createElement('div');
  view.className = 'shopBranchView';
  view.hidden = true;
  const viewTitle = appendText(documentSource, view, 'h2', 'shopBranchViewTitle', '');
  const viewNote = appendText(documentSource, view, 'p', 'shopBranchViewNote', '');
  const backButton = appendText(documentSource, view, 'button', 'btn shopBranchViewBack', SHOP_ENTRY_BRANCH_BACK_LABEL);
  backButton.type = 'button';

  const viewParent = panel && typeof panel.appendChild === 'function' ? panel : null;
  if (viewParent) viewParent.appendChild(view);

  let activeBranchId = null;

  function setActiveBranch(id) {
    activeBranchId = id;
    for (const card of cards) {
      if (card.dataset.shopBranch === id) card.dataset.shopBranchActive = 'true';
      else delete card.dataset.shopBranchActive;
    }
  }

  function showPendingNote(branch) {
    viewTitle.textContent = branch.title;
    viewNote.textContent = branch.description + ' — ' + SHOP_ENTRY_BRANCH_PENDING_NOTE;
    view.hidden = false;
    scrollIntoViewIfPossible(view);
  }

  function openBranch(id) {
    const branch = findBranch(id);
    if (!branch) return Object.freeze({ok:false, branch:id, reason:'unknown-branch'});
    setActiveBranch(branch.id);
    if (branch.id === 'pack') {
      view.hidden = true;
      return Object.freeze({ok:true, branch:branch.id, action:'navigate-gacha'});
    }
    if (branch.id === 'supply') {
      view.hidden = true;
      if (chargeHost) chargeHost.hidden = true;
      if (exchangeHost) exchangeHost.hidden = true;
      scrollIntoViewIfPossible(catalogHost);
      return Object.freeze({ok:true, branch:branch.id, action:'show-catalog'});
    }
    if (branch.id === 'charge' && chargeHost) {
      view.hidden = true;
      if (exchangeHost) exchangeHost.hidden = true;
      chargeHost.hidden = false;
      scrollIntoViewIfPossible(chargeHost);
      return Object.freeze({ok:true, branch:branch.id, action:'show-charge'});
    }
    if (branch.id === 'exchange' && exchangeHost) {
      view.hidden = true;
      if (chargeHost) chargeHost.hidden = true;
      exchangeHost.hidden = false;
      scrollIntoViewIfPossible(exchangeHost);
      return Object.freeze({ok:true, branch:branch.id, action:'show-exchange'});
    }
    showPendingNote(branch);
    return Object.freeze({ok:true, branch:branch.id, action:'show-pending-note'});
  }

  function closeBranch() {
    setActiveBranch(null);
    view.hidden = true;
    if (chargeHost) chargeHost.hidden = true;
    if (exchangeHost) exchangeHost.hidden = true;
    scrollIntoViewIfPossible(grid);
    return Object.freeze({ok:true, branch:null, action:'back-to-entry'});
  }

  for (const button of openButtons) {
    if (typeof button.addEventListener === 'function') {
      button.addEventListener('click', ()=>openBranch(button.dataset.shopBranchOpen));
    }
  }
  if (typeof backButton.addEventListener === 'function') {
    backButton.addEventListener('click', ()=>closeBranch());
  }

  const runtime = Object.freeze({
    mounted:true,
    schema:SHOP_ENTRY_BRANCHES_SCHEMA,
    projection:projectShopEntryBranches(),
    openBranch,
    closeBranch,
    getActiveBranch:()=>activeBranchId,
    getBranchView:()=>view,
    purchaseAuthority:false,
    ownershipMutationAllowed:false,
    saveMutationAllowed:false,
  });
  mountedByGrid.set(grid, runtime);
  return runtime;
}

export function ensureShopEntryBranchesRuntime(documentSource = globalThis.document) {
  if (!documentSource || typeof documentSource.querySelectorAll !== 'function' || typeof documentSource.createElement !== 'function') return null;
  const shopScreen = [...documentSource.querySelectorAll('.screen[data-screen]')]
    .find((candidate) => candidate?.dataset?.screen === 'shop');
  if (!shopScreen || typeof shopScreen.querySelector !== 'function') return null;
  const grid = shopScreen.querySelector('.shopGrid');
  if (!grid) return null;
  const panel = shopScreen.querySelector('.shopPanel') || shopScreen;
  const catalogHost = shopScreen.querySelector('#shopFormalCatalog') || null;
  const chargeHost = shopScreen.querySelector('[data-shop-charge-view]') || null;
  const exchangeHost = shopScreen.querySelector('[data-shop-exchange-view]') || null;
  try {
    return mountShopEntryBranchesRuntime({grid, panel, catalogHost, chargeHost, exchangeHost, documentSource});
  } catch {
    return null;
  }
}
