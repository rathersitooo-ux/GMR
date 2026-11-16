// Shop exchange place (#5 of GAMEROAD-ショップ実装表-20261112).
// The exchange branch: an exchange-station list with categories,
// required counts and limits per item (the Shadowverse dungeon-shop
// form from the embedding doc: category switching + required number
// + limit visible).
// Display only: this module never claims exchange authority and never
// mutates ownership or saves. Every exchange button here is disabled.
// Exchange basis: the three set types and "1 ticket per set" are the
// documented Shadowverse Worlds Beyond figures (exchange ticket from
// packs, 1 ticket per set, ticket valid 180 days), used as the display
// basis only. ライカ has not decided GAMEROAD's exchange lineup; when
// it is decided, replace only these values. The first-period skin
// subject (navigator サースナー) follows ライカ's decided first-period
// skin lineup (navigator サースナー + 3 people); the exchange character
// for set 1 is the display basis, not a decided lineup.
// Event exchange opens only during an event (operations table), so with
// no event running it shows the empty state, not an invented event.

export const SHOP_EXCHANGE_SCHEMA = 'gameroad.shop-exchange.v1';
export const SHOP_EXCHANGE_STYLE_ID = 'gameroad-shop-exchange-r1';
export const SHOP_EXCHANGE_VIEW_ID = 'shopExchangeView';
export const SHOP_EXCHANGE_DISPLAY_ONLY_NOTE = '※ いまは表示だけです。交換機能は現在利用できません。';
export const SHOP_EXCHANGE_BASIS_NOTE = '※ 交換先と必要数はシャドバの実数を土台にした表示で、GAMEROADの交換先として決めた物ではありません。';
export const SHOP_EXCHANGE_TICKET_NOTE = '交換チケットはパック購入でまれに出ます。チケットの期限は180日です。';
export const SHOP_EXCHANGE_BALANCE_NOTE = 'いま持っている交換チケット';
export const SHOP_EXCHANGE_EXCHANGE_DISABLED_LABEL = '交換する（いまは交換できません）';
export const SHOP_EXCHANGE_EVENT_EMPTY_TITLE = 'いま開いているイベントはありません';
export const SHOP_EXCHANGE_EVENT_EMPTY_NOTE = 'イベント交換所はイベント期間だけ開きます。期間が終わると閉じます。';

export const SHOP_EXCHANGE_CATEGORIES = Object.freeze([
  Object.freeze({id: 'ticket', title: 'チケット交換'}),
  Object.freeze({id: 'event', title: 'イベント交換'}),
]);

export const SHOP_EXCHANGE_TICKET_BALANCE = Object.freeze({
  tickets: 0,
});

export const SHOP_EXCHANGE_TICKET_ITEMS = Object.freeze([
  Object.freeze({
    id: 'exchange-sasner-skin-set',
    title: 'サースナーのスキンセット',
    detail: 'パートナースキン ／ スリーブ ／ エンブレム ／ フレア',
    tickets: 1,
    limit: 1,
    limitText: '上限：1回まで',
  }),
  Object.freeze({
    id: 'exchange-sasner-style-set',
    title: 'サースナーのカードスタイル＆ホーム背景セット',
    detail: 'カードスタイル ／ ホーム背景',
    tickets: 1,
    limit: 1,
    limitText: '上限：1回まで',
  }),
  Object.freeze({
    id: 'exchange-sasner-visage-set',
    title: 'サースナーのなりきりセット',
    detail: 'サースナーの姿になりきるセット',
    tickets: 1,
    limit: 1,
    limitText: '上限：1回まで',
  }),
]);

export const SHOP_EXCHANGE_CSS = `
.shopExchangeView{margin-top:12px;padding:16px;border:1px solid rgba(198,239,228,.22);background:linear-gradient(145deg,rgba(12,43,37,.96),rgba(5,19,17,.96))}
.shopExchangeView[hidden]{display:none}
.shopExchangeTitle{margin:0 0 6px;font-size:clamp(18px,2.2vw,28px);line-height:1.1}
.shopExchangeNote{margin:0 0 12px;color:#bfd4cd;font-size:11px;line-height:1.6}
.shopExchangeBalance{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 14px}
.shopExchangeBalanceItem{flex:1;min-width:140px;padding:10px 12px;border:1px solid rgba(198,239,228,.22);background:rgba(6,20,17,.78)}
.shopExchangeBalanceItem b{display:block;font-size:clamp(20px,2.4vw,30px);color:#aef0d5}
.shopExchangeBalanceItem span{font-size:10px;color:#bfd4cd}
.shopExchangeSectionTitle{margin:14px 0 8px;font-size:15px;font-weight:800}
.shopExchangeTabs{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px}
.shopExchangeTab[aria-pressed="true"]{border-color:rgba(160,239,213,.62);box-shadow:0 18px 42px rgba(0,0,0,.24)}
.shopExchangeList{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.shopExchangeList[hidden]{display:none}
.shopExchangeCard{padding:12px;border:1px solid rgba(198,239,228,.22);background:rgba(6,20,17,.78);display:flex;flex-direction:column;gap:4px}
.shopExchangeCardTitle{font-size:15px;font-weight:800}
.shopExchangeCardDetail{color:#bfd4cd;font-size:11px;line-height:1.6;flex:1}
.shopExchangeCardNeed{font-size:14px;font-weight:800}
.shopExchangeCardLimit{color:#bfd4cd;font-size:11px;line-height:1.6}
.shopExchangeCard .btn{align-self:flex-start}
.shopExchangeEmpty{padding:16px;border:1px solid rgba(198,239,228,.22);background:rgba(6,20,17,.78)}
.shopExchangeEmptyTitle{margin:0 0 6px;font-size:15px;font-weight:800}
.shopExchangeEmptyNote{margin:0;color:#bfd4cd;font-size:11px;line-height:1.6}
@media(max-width:900px){.shopExchangeList{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:540px) and (orientation:portrait){.shopExchangeList{grid-template-columns:1fr}}
`;

export function exchangeItemNeedText(item) {
  return `交換チケット ${item.tickets}枚`;
}

export function projectShopExchange() {
  return Object.freeze({
    schema: SHOP_EXCHANGE_SCHEMA,
    categories: SHOP_EXCHANGE_CATEGORIES,
    balance: SHOP_EXCHANGE_TICKET_BALANCE,
    ticketItems: SHOP_EXCHANGE_TICKET_ITEMS,
    eventOpen: false,
    purchaseAuthority: false,
    ownershipMutationAllowed: false,
    saveMutationAllowed: false,
  });
}

export function ensureShopExchangeStyle(documentSource = globalThis.document) {
  if (!documentSource?.head || typeof documentSource.createElement !== 'function') return false;
  if (documentSource.getElementById?.(SHOP_EXCHANGE_STYLE_ID)) return false;
  const style = documentSource.createElement('style');
  style.id = SHOP_EXCHANGE_STYLE_ID;
  style.textContent = SHOP_EXCHANGE_CSS;
  if (typeof documentSource.head.appendChild === 'function') documentSource.head.appendChild(style);
  else documentSource.head.append?.(style);
  return true;
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

const mountedByPanel = new WeakMap();

export function mountShopExchangeRuntime({
  panel,
  documentSource = globalThis.document,
} = {}) {
  if (!panel || typeof panel !== 'object' || typeof panel.appendChild !== 'function') {
    throw new Error('shop exchange requires a panel node');
  }
  if (mountedByPanel.has(panel)) return mountedByPanel.get(panel);
  if (!documentSource || typeof documentSource.createElement !== 'function') {
    throw new Error('document source unavailable');
  }

  ensureShopExchangeStyle(documentSource);

  const view = documentSource.createElement('div');
  view.id = SHOP_EXCHANGE_VIEW_ID;
  view.className = 'shopExchangeView';
  view.setAttribute?.('data-shop-exchange-view', 'true');
  view.hidden = true;

  appendText(documentSource, view, 'h2', 'shopExchangeTitle', '交換');
  appendText(documentSource, view, 'p', 'shopExchangeNote', SHOP_EXCHANGE_DISPLAY_ONLY_NOTE);

  appendText(documentSource, view, 'h3', 'shopExchangeSectionTitle', SHOP_EXCHANGE_BALANCE_NOTE);
  const balance = documentSource.createElement('div');
  balance.className = 'shopExchangeBalance';
  const ticketItem = documentSource.createElement('div');
  ticketItem.className = 'shopExchangeBalanceItem';
  ticketItem.setAttribute?.('data-shop-exchange-balance', 'tickets');
  appendText(documentSource, ticketItem, 'b', null, `交換チケット ${SHOP_EXCHANGE_TICKET_BALANCE.tickets}枚`);
  appendText(documentSource, ticketItem, 'span', null, 'パック購入でまれに出るよ');
  balance.appendChild(ticketItem);
  view.appendChild(balance);
  appendText(documentSource, view, 'p', 'shopExchangeNote', SHOP_EXCHANGE_TICKET_NOTE);

  const tabs = documentSource.createElement('div');
  tabs.className = 'shopExchangeTabs';
  tabs.setAttribute?.('data-shop-exchange-tabs', 'true');
  const tabButtons = new Map();
  for (const category of SHOP_EXCHANGE_CATEGORIES) {
    const tab = appendText(documentSource, tabs, 'button', 'btn shopExchangeTab', category.title);
    tab.type = 'button';
    tab.setAttribute?.('data-shop-exchange-category', category.id);
    tab.setAttribute?.('aria-pressed', category.id === 'ticket' ? 'true' : 'false');
    tabButtons.set(category.id, tab);
  }
  view.appendChild(tabs);

  const ticketList = documentSource.createElement('div');
  ticketList.className = 'shopExchangeList';
  ticketList.setAttribute?.('data-shop-exchange-list', 'ticket');
  for (const item of SHOP_EXCHANGE_TICKET_ITEMS) {
    const card = documentSource.createElement('div');
    card.className = 'shopExchangeCard';
    card.setAttribute?.('data-shop-exchange-item', item.id);
    appendText(documentSource, card, 'div', 'shopExchangeCardTitle', item.title);
    appendText(documentSource, card, 'div', 'shopExchangeCardDetail', item.detail);
    appendText(documentSource, card, 'div', 'shopExchangeCardNeed', exchangeItemNeedText(item));
    appendText(documentSource, card, 'div', 'shopExchangeCardLimit', item.limitText);
    const exchangeButton = appendText(documentSource, card, 'button', 'btn', SHOP_EXCHANGE_EXCHANGE_DISABLED_LABEL);
    exchangeButton.type = 'button';
    exchangeButton.disabled = true;
    ticketList.appendChild(card);
  }
  view.appendChild(ticketList);

  const eventList = documentSource.createElement('div');
  eventList.className = 'shopExchangeList';
  eventList.setAttribute?.('data-shop-exchange-list', 'event');
  eventList.hidden = true;
  const empty = documentSource.createElement('div');
  empty.className = 'shopExchangeEmpty';
  empty.setAttribute?.('data-shop-exchange-event-empty', 'true');
  appendText(documentSource, empty, 'div', 'shopExchangeEmptyTitle', SHOP_EXCHANGE_EVENT_EMPTY_TITLE);
  appendText(documentSource, empty, 'div', 'shopExchangeEmptyNote', SHOP_EXCHANGE_EVENT_EMPTY_NOTE);
  eventList.appendChild(empty);
  view.appendChild(eventList);

  appendText(documentSource, view, 'p', 'shopExchangeNote', SHOP_EXCHANGE_BASIS_NOTE);

  panel.appendChild(view);

  let activeCategoryId = 'ticket';

  function switchCategory(id) {
    const category = SHOP_EXCHANGE_CATEGORIES.find((entry) => entry.id === id) || null;
    if (!category) return Object.freeze({ok: false, category: id, reason: 'unknown-category'});
    activeCategoryId = category.id;
    for (const [tabId, tab] of tabButtons) {
      tab.setAttribute?.('aria-pressed', tabId === category.id ? 'true' : 'false');
    }
    ticketList.hidden = category.id !== 'ticket';
    eventList.hidden = category.id !== 'event';
    return Object.freeze({ok: true, category: category.id, action: 'switch-exchange-category'});
  }

  function showExchangeView() {
    view.hidden = false;
    scrollIntoViewIfPossible(view);
    return Object.freeze({ok: true, action: 'show-exchange'});
  }

  function hideExchangeView() {
    view.hidden = true;
    return Object.freeze({ok: true, action: 'hide-exchange'});
  }

  for (const [tabId, tab] of tabButtons) {
    if (typeof tab.addEventListener === 'function') {
      tab.addEventListener('click', () => switchCategory(tabId));
    }
  }

  const runtime = Object.freeze({
    mounted: true,
    schema: SHOP_EXCHANGE_SCHEMA,
    projection: projectShopExchange(),
    showExchangeView,
    hideExchangeView,
    switchCategory,
    getActiveCategory: () => activeCategoryId,
    getExchangeView: () => view,
    purchaseAuthority: false,
    ownershipMutationAllowed: false,
    saveMutationAllowed: false,
  });
  mountedByPanel.set(panel, runtime);
  return runtime;
}

export function ensureShopExchangeRuntime(documentSource = globalThis.document) {
  if (!documentSource || typeof documentSource.querySelectorAll !== 'function' || typeof documentSource.createElement !== 'function') return null;
  const shopScreen = [...documentSource.querySelectorAll('.screen[data-screen]')]
    .find((candidate) => candidate?.dataset?.screen === 'shop');
  if (!shopScreen || typeof shopScreen.querySelector !== 'function') return null;
  const panel = shopScreen.querySelector('.shopPanel') || shopScreen;
  try {
    return mountShopExchangeRuntime({panel, documentSource});
  } catch {
    return null;
  }
}
