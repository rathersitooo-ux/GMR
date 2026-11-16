// Shop charge place (#4 of GAMEROAD-ショップ実装表-20261112).
// The charge branch: crystal packs, bundles, and the battle pass purchase
// entry, with paid and free crystals shown separately (#6 ruling:
// Shadowverse-style, paid and free displayed apart).
// Display only: this module never claims purchase authority and never
// mutates ownership or saves. The shop already states purchases are
// unavailable, and every buy button here is disabled.
// Price basis: crystal pack and bundle amounts/prices are the documented
// Shadowverse Worlds Beyond WebStore figures (2026-09-11調べ / 2026-10-28
// release bundle), used as the display basis only. ライカ has not decided
// GAMEROAD's prices; when they are decided, replace only these values.
// The battle pass price (500円) is different: it is ライカ's decided spec
// (season-s1-config.mjs BATTLE_PASS_PRICE_YEN), so it is imported, not
// copied, from the single source.

import {BATTLE_PASS_PRICE_YEN} from './season-s1-config.mjs';

export const SHOP_CHARGE_SCHEMA = 'gameroad.shop-charge.v1';
export const SHOP_CHARGE_STYLE_ID = 'gameroad-shop-charge-r1';
export const SHOP_CHARGE_VIEW_ID = 'shopChargeView';
export const SHOP_CHARGE_BALANCE_NOTE = 'いま持っているクリスタル';
export const SHOP_CHARGE_DISPLAY_ONLY_NOTE = '※ いまは表示だけです。購入機能は現在利用できません。';
export const SHOP_CHARGE_PRICE_BASIS_NOTE = '※ クリスタルとバンドルの価格はシャドバの実数を土台にした表示で、GAMEROADの価格として決めた物ではありません。バトルパスの500円だけがライカの仕様です。';
export const SHOP_CHARGE_BUY_DISABLED_LABEL = '買う（いまは買えません）';
export const SHOP_CHARGE_PASS_BUTTON_LABEL = 'バトルパスを見る';
export const SHOP_CHARGE_PASS_BUTTON_MISSING = 'pass-button-missing';

export const SHOP_CHARGE_BALANCE = Object.freeze({
  paid: 0,
  free: 0,
});

export const SHOP_CHARGE_CRYSTAL_PACKS = Object.freeze([
  Object.freeze({id: 'crystal-60', total: 60, paid: 60, free: 0, priceYen: 150}),
  Object.freeze({id: 'crystal-240', total: 240, paid: 200, free: 40, priceYen: 500}),
  Object.freeze({id: 'crystal-490', total: 490, paid: 400, free: 90, priceYen: 1000}),
  Object.freeze({id: 'crystal-990', total: 990, paid: 800, free: 190, priceYen: 2000}),
  Object.freeze({id: 'crystal-1500', total: 1500, paid: 1200, free: 300, priceYen: 3000}),
  Object.freeze({id: 'crystal-2600', total: 2600, paid: 2000, free: 600, priceYen: 5000}),
  Object.freeze({id: 'crystal-5500', total: 5500, paid: 4000, free: 1500, priceYen: 10000}),
]);

export const SHOP_CHARGE_BUNDLES = Object.freeze([
  Object.freeze({
    id: 'bundle-release',
    title: 'リリース記念バンドル',
    contents: Object.freeze([
      '有償クリスタル 2000個',
      '無償クリスタル 200個',
      'レジェンドパックチケット 3枚',
      'エーテル 3500個',
    ]),
    priceYen: 5000,
    limitText: '1セット限定',
  }),
]);

export const SHOP_CHARGE_CSS = `
.shopChargeView{margin-top:12px;padding:16px;border:1px solid rgba(198,239,228,.22);background:linear-gradient(145deg,rgba(12,43,37,.96),rgba(5,19,17,.96))}
.shopChargeView[hidden]{display:none}
.shopChargeTitle{margin:0 0 6px;font-size:clamp(18px,2.2vw,28px);line-height:1.1}
.shopChargeNote{margin:0 0 12px;color:#bfd4cd;font-size:11px;line-height:1.6}
.shopChargeBalance{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 14px}
.shopChargeBalanceItem{flex:1;min-width:140px;padding:10px 12px;border:1px solid rgba(198,239,228,.22);background:rgba(6,20,17,.78)}
.shopChargeBalanceItem b{display:block;font-size:clamp(20px,2.4vw,30px);color:#aef0d5}
.shopChargeBalanceItem span{font-size:10px;color:#bfd4cd}
.shopChargeSectionTitle{margin:14px 0 8px;font-size:15px;font-weight:800}
.shopChargeList{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.shopChargeCard{padding:12px;border:1px solid rgba(198,239,228,.22);background:rgba(6,20,17,.78);display:flex;flex-direction:column;gap:4px}
.shopChargeCardTitle{font-size:15px;font-weight:800}
.shopChargeCardDetail{color:#bfd4cd;font-size:11px;line-height:1.6;flex:1}
.shopChargeCardPrice{font-size:14px;font-weight:800}
.shopChargeCard .btn{align-self:flex-start}
.shopChargePass{margin-top:14px;padding:12px;border:1px solid rgba(255,208,123,.4);background:rgba(255,208,123,.07);display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between}
.shopChargePassText{flex:1;min-width:220px}
.shopChargePassText b{display:block;font-size:15px}
.shopChargePassText span{color:#bfd4cd;font-size:11px;line-height:1.6}
@media(max-width:900px){.shopChargeList{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:540px) and (orientation:portrait){.shopChargeList{grid-template-columns:1fr}}
`;

export function crystalPackLabel(pack) {
  return `クリスタル${pack.total}個`;
}

export function crystalPackDetail(pack) {
  return pack.free > 0
    ? `有償 ${pack.paid}個 ／ 無償 ${pack.free}個`
    : `有償 ${pack.paid}個`;
}

export function crystalPackPriceText(pack) {
  return `${pack.priceYen.toLocaleString('ja-JP')}円`;
}

export function projectShopCharge() {
  return Object.freeze({
    schema: SHOP_CHARGE_SCHEMA,
    balance: SHOP_CHARGE_BALANCE,
    crystalPacks: SHOP_CHARGE_CRYSTAL_PACKS,
    bundles: SHOP_CHARGE_BUNDLES,
    battlePassPriceYen: BATTLE_PASS_PRICE_YEN,
    purchaseAuthority: false,
    ownershipMutationAllowed: false,
    saveMutationAllowed: false,
  });
}

export function ensureShopChargeStyle(documentSource = globalThis.document) {
  if (!documentSource?.head || typeof documentSource.createElement !== 'function') return false;
  if (documentSource.getElementById?.(SHOP_CHARGE_STYLE_ID)) return false;
  const style = documentSource.createElement('style');
  style.id = SHOP_CHARGE_STYLE_ID;
  style.textContent = SHOP_CHARGE_CSS;
  if (typeof documentSource.head.appendChild === 'function') documentSource.head.appendChild(style);
  else documentSource.head.append?.(style);
  return true;
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

function findBattlePassButton(documentSource) {
  if (!documentSource || typeof documentSource.querySelectorAll !== 'function') return null;
  const buttons = documentSource.querySelectorAll('button');
  const list = Array.isArray(buttons) ? buttons : Array.from(buttons || []);
  return list.find((button) => button?.textContent === SHOP_CHARGE_PASS_BUTTON_LABEL) || null;
}

const mountedByPanel = new WeakMap();

export function mountShopChargeRuntime({
  panel,
  documentSource = globalThis.document,
} = {}) {
  if (!panel || typeof panel !== 'object' || typeof panel.appendChild !== 'function') {
    throw new Error('shop charge requires a panel node');
  }
  if (mountedByPanel.has(panel)) return mountedByPanel.get(panel);
  if (!documentSource || typeof documentSource.createElement !== 'function') {
    throw new Error('document source unavailable');
  }

  ensureShopChargeStyle(documentSource);

  const view = documentSource.createElement('div');
  view.id = SHOP_CHARGE_VIEW_ID;
  view.className = 'shopChargeView';
  view.setAttribute?.('data-shop-charge-view', 'true');
  view.hidden = true;

  appendText(documentSource, view, 'h2', 'shopChargeTitle', '課金');
  appendText(documentSource, view, 'p', 'shopChargeNote', SHOP_CHARGE_DISPLAY_ONLY_NOTE);

  const balanceTitle = appendText(documentSource, view, 'h3', 'shopChargeSectionTitle', SHOP_CHARGE_BALANCE_NOTE);
  balanceTitle.setAttribute?.('data-shop-charge-balance-title', 'true');
  const balance = documentSource.createElement('div');
  balance.className = 'shopChargeBalance';
  const paidItem = documentSource.createElement('div');
  paidItem.className = 'shopChargeBalanceItem';
  paidItem.setAttribute?.('data-shop-charge-balance', 'paid');
  appendText(documentSource, paidItem, 'b', null, `有償クリスタル ${SHOP_CHARGE_BALANCE.paid}個`);
  appendText(documentSource, paidItem, 'span', null, '買った分');
  const freeItem = documentSource.createElement('div');
  freeItem.className = 'shopChargeBalanceItem';
  freeItem.setAttribute?.('data-shop-charge-balance', 'free');
  appendText(documentSource, freeItem, 'b', null, `無償クリスタル ${SHOP_CHARGE_BALANCE.free}個`);
  appendText(documentSource, freeItem, 'span', null, 'おまけでもらった分');
  balance.appendChild(paidItem);
  balance.appendChild(freeItem);
  view.appendChild(balance);

  appendText(documentSource, view, 'h3', 'shopChargeSectionTitle', 'クリスタル');
  const packList = documentSource.createElement('div');
  packList.className = 'shopChargeList';
  packList.setAttribute?.('data-shop-charge-list', 'crystal-packs');
  for (const pack of SHOP_CHARGE_CRYSTAL_PACKS) {
    const card = documentSource.createElement('div');
    card.className = 'shopChargeCard';
    card.setAttribute?.('data-shop-charge-pack', pack.id);
    appendText(documentSource, card, 'div', 'shopChargeCardTitle', crystalPackLabel(pack));
    appendText(documentSource, card, 'div', 'shopChargeCardDetail', crystalPackDetail(pack));
    appendText(documentSource, card, 'div', 'shopChargeCardPrice', crystalPackPriceText(pack));
    const buyButton = appendText(documentSource, card, 'button', 'btn', SHOP_CHARGE_BUY_DISABLED_LABEL);
    buyButton.type = 'button';
    buyButton.disabled = true;
    packList.appendChild(card);
  }
  view.appendChild(packList);

  appendText(documentSource, view, 'h3', 'shopChargeSectionTitle', 'バンドル');
  const bundleList = documentSource.createElement('div');
  bundleList.className = 'shopChargeList';
  bundleList.setAttribute?.('data-shop-charge-list', 'bundles');
  for (const bundle of SHOP_CHARGE_BUNDLES) {
    const card = documentSource.createElement('div');
    card.className = 'shopChargeCard';
    card.setAttribute?.('data-shop-charge-bundle', bundle.id);
    appendText(documentSource, card, 'div', 'shopChargeCardTitle', bundle.title);
    appendText(documentSource, card, 'div', 'shopChargeCardDetail',
      [...bundle.contents, bundle.limitText].join(' ／ '));
    appendText(documentSource, card, 'div', 'shopChargeCardPrice',
      `${bundle.priceYen.toLocaleString('ja-JP')}円`);
    const buyButton = appendText(documentSource, card, 'button', 'btn', SHOP_CHARGE_BUY_DISABLED_LABEL);
    buyButton.type = 'button';
    buyButton.disabled = true;
    bundleList.appendChild(card);
  }
  view.appendChild(bundleList);

  const pass = documentSource.createElement('div');
  pass.className = 'shopChargePass';
  pass.setAttribute?.('data-shop-charge-pass', 'true');
  const passText = documentSource.createElement('div');
  passText.className = 'shopChargePassText';
  appendText(documentSource, passText, 'b', null, `バトルパス ${BATTLE_PASS_PRICE_YEN}円`);
  appendText(documentSource, passText, 'span', null,
    '買うとシーズンの間、前弾までの全カードが無料で使えるよ。目玉は40レベルのパートナースキンだよ。');
  pass.appendChild(passText);
  const passButton = appendText(documentSource, pass, 'button', 'btn primary', SHOP_CHARGE_PASS_BUTTON_LABEL);
  passButton.type = 'button';
  view.appendChild(pass);

  appendText(documentSource, view, 'p', 'shopChargeNote', SHOP_CHARGE_PRICE_BASIS_NOTE);

  panel.appendChild(view);

  function showChargeView() {
    view.hidden = false;
    scrollIntoViewIfPossible(view);
    return Object.freeze({ok: true, action: 'show-charge'});
  }

  function hideChargeView() {
    view.hidden = true;
    return Object.freeze({ok: true, action: 'hide-charge'});
  }

  function openBattlePass() {
    const homePassButton = findBattlePassButton(documentSource);
    if (!homePassButton || typeof homePassButton.click !== 'function') {
      return Object.freeze({ok: false, reason: SHOP_CHARGE_PASS_BUTTON_MISSING});
    }
    homePassButton.click();
    return Object.freeze({ok: true, action: 'open-battle-pass'});
  }

  if (typeof passButton.addEventListener === 'function') {
    passButton.addEventListener('click', () => openBattlePass());
  }

  const runtime = Object.freeze({
    mounted: true,
    schema: SHOP_CHARGE_SCHEMA,
    projection: projectShopCharge(),
    showChargeView,
    hideChargeView,
    openBattlePass,
    getChargeView: () => view,
    purchaseAuthority: false,
    ownershipMutationAllowed: false,
    saveMutationAllowed: false,
  });
  mountedByPanel.set(panel, runtime);
  return runtime;
}

export function ensureShopChargeRuntime(documentSource = globalThis.document) {
  if (!documentSource || typeof documentSource.querySelectorAll !== 'function' || typeof documentSource.createElement !== 'function') return null;
  const shopScreen = [...documentSource.querySelectorAll('.screen[data-screen]')]
    .find((candidate) => candidate?.dataset?.screen === 'shop');
  if (!shopScreen || typeof shopScreen.querySelector !== 'function') return null;
  const panel = shopScreen.querySelector('.shopPanel') || shopScreen;
  try {
    return mountShopChargeRuntime({panel, documentSource});
  } catch {
    return null;
  }
}
