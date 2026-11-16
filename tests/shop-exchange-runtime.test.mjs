import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHOP_EXCHANGE_SCHEMA,
  SHOP_EXCHANGE_CSS,
  SHOP_EXCHANGE_VIEW_ID,
  SHOP_EXCHANGE_DISPLAY_ONLY_NOTE,
  SHOP_EXCHANGE_BASIS_NOTE,
  SHOP_EXCHANGE_TICKET_NOTE,
  SHOP_EXCHANGE_BALANCE_NOTE,
  SHOP_EXCHANGE_EXCHANGE_DISABLED_LABEL,
  SHOP_EXCHANGE_EVENT_EMPTY_TITLE,
  SHOP_EXCHANGE_EVENT_EMPTY_NOTE,
  SHOP_EXCHANGE_CATEGORIES,
  SHOP_EXCHANGE_TICKET_BALANCE,
  SHOP_EXCHANGE_TICKET_ITEMS,
  exchangeItemNeedText,
  projectShopExchange,
  mountShopExchangeRuntime,
  ensureShopExchangeRuntime,
} from '../browser/shop-exchange-runtime.mjs';

class FakeNode {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName;
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.className = '';
    this.textContent = '';
    this.hidden = false;
    this.disabled = false;
    this.scrolledIntoView = 0;
    this.listeners = new Map();
  }
  appendChild(node) { this.children.push(node); return node; }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  click() { this.listeners.get('click')?.(); }
  scrollIntoView() { this.scrolledIntoView += 1; }
}

class FakeDocument {
  constructor() {
    this.head = new FakeNode('head', this);
    this.stylesById = new Map();
    this.nodesById = new Map();
    this.screens = [];
  }
  createElement(tagName) { return new FakeNode(tagName, this); }
  createDocumentFragment() { return new FakeNode('#fragment', this); }
  getElementById(id) {
    if (id === 'gameroad-shop-exchange-r1') return this.stylesById.get(id) || null;
    return this.nodesById.get(id) || null;
  }
  querySelectorAll(selector) {
    if (selector === '.screen[data-screen]') return this.screens;
    return [];
  }
}

function flatten(node) {
  return [node, ...node.children.flatMap(flatten)];
}

test('exchange projection lists categories, balance and ticket items', () => {
  const out = projectShopExchange();
  assert.equal(out.schema, SHOP_EXCHANGE_SCHEMA);
  assert.deepEqual(out.categories.map((category) => category.id), ['ticket', 'event']);
  assert.deepEqual(out.balance, {tickets: 0});
  assert.equal(out.ticketItems.length, 3);
  assert.deepEqual(out.ticketItems.map((item) => item.id), [
    'exchange-sasner-skin-set',
    'exchange-sasner-style-set',
    'exchange-sasner-visage-set',
  ]);
  assert.equal(out.eventOpen, false);
  assert.equal(out.purchaseAuthority, false);
  assert.equal(out.ownershipMutationAllowed, false);
  assert.equal(out.saveMutationAllowed, false);
});

test('every ticket item costs one ticket with a one-time limit', () => {
  for (const item of SHOP_EXCHANGE_TICKET_ITEMS) {
    assert.equal(item.tickets, 1);
    assert.equal(item.limit, 1);
    assert.equal(item.limitText, '上限：1回まで');
    assert.equal(exchangeItemNeedText(item), '交換チケット 1枚');
  }
  assert.equal(SHOP_EXCHANGE_TICKET_ITEMS[0].title, 'サースナーのスキンセット');
  assert.match(SHOP_EXCHANGE_TICKET_ITEMS[0].detail, /パートナースキン/);
  assert.match(SHOP_EXCHANGE_TICKET_ITEMS[1].detail, /カードスタイル/);
  assert.match(SHOP_EXCHANGE_TICKET_ITEMS[2].title, /なりきり/);
  assert.equal(SHOP_EXCHANGE_TICKET_BALANCE.tickets, 0);
});

test('exchange view mounts hidden with balance, tabs, cards and event empty state', () => {
  const documentSource = new FakeDocument();
  const panel = new FakeNode('div', documentSource);
  const runtime = mountShopExchangeRuntime({panel, documentSource});
  const again = mountShopExchangeRuntime({panel, documentSource});
  assert.equal(again, runtime);

  const view = runtime.getExchangeView();
  assert.equal(view.id, SHOP_EXCHANGE_VIEW_ID);
  assert.equal(view.hidden, true);
  assert.equal(view.getAttribute('data-shop-exchange-view'), 'true');
  const nodes = flatten(view);
  assert.equal(nodes.find((node) => node.className === 'shopExchangeTitle').textContent, '交換');
  assert.match(nodes.find((node) => node.textContent === SHOP_EXCHANGE_DISPLAY_ONLY_NOTE).textContent, /表示だけです/);
  assert.equal(nodes.find((node) => node.textContent === SHOP_EXCHANGE_BALANCE_NOTE).textContent, SHOP_EXCHANGE_BALANCE_NOTE);
  const balance = nodes.find((node) => node.attributes.get('data-shop-exchange-balance') === 'tickets');
  assert.match(flatten(balance).find((node) => node.tagName === 'b').textContent, /交換チケット 0枚/);
  assert.equal(nodes.find((node) => node.textContent === SHOP_EXCHANGE_TICKET_NOTE).textContent, SHOP_EXCHANGE_TICKET_NOTE);
  assert.equal(nodes.filter((node) => node.className === 'shopExchangeCard').length, 3);
  assert.equal(nodes.filter((node) => node.attributes.get('data-shop-exchange-item')).length, 3);
  assert.equal(nodes.filter((node) => node.className === 'btn shopExchangeTab').length, 2);
  const empty = nodes.find((node) => node.attributes.get('data-shop-exchange-event-empty') === 'true');
  assert.ok(empty);
  assert.equal(flatten(empty).find((node) => node.className === 'shopExchangeEmptyTitle').textContent, SHOP_EXCHANGE_EVENT_EMPTY_TITLE);
  assert.equal(flatten(empty).find((node) => node.className === 'shopExchangeEmptyNote').textContent, SHOP_EXCHANGE_EVENT_EMPTY_NOTE);
  assert.equal(nodes.find((node) => node.textContent === SHOP_EXCHANGE_BASIS_NOTE).textContent, SHOP_EXCHANGE_BASIS_NOTE);
});

test('exchange buttons are disabled: display only, no exchange authority', () => {
  const documentSource = new FakeDocument();
  const panel = new FakeNode('div', documentSource);
  const runtime = mountShopExchangeRuntime({panel, documentSource});
  const nodes = flatten(runtime.getExchangeView());
  const exchangeButtons = nodes.filter((node) => node.textContent === SHOP_EXCHANGE_EXCHANGE_DISABLED_LABEL);
  assert.equal(exchangeButtons.length, 3);
  assert.ok(exchangeButtons.every((button) => button.disabled === true));
  assert.equal(runtime.purchaseAuthority, false);
});

test('category tabs switch the ticket and event lists', () => {
  const documentSource = new FakeDocument();
  const panel = new FakeNode('div', documentSource);
  const runtime = mountShopExchangeRuntime({panel, documentSource});
  const view = runtime.getExchangeView();
  const nodes = flatten(view);
  const ticketList = nodes.find((node) => node.attributes.get('data-shop-exchange-list') === 'ticket');
  const eventList = nodes.find((node) => node.attributes.get('data-shop-exchange-list') === 'event');
  const ticketTab = nodes.find((node) => node.attributes.get('data-shop-exchange-category') === 'ticket');
  const eventTab = nodes.find((node) => node.attributes.get('data-shop-exchange-category') === 'event');

  assert.equal(runtime.getActiveCategory(), 'ticket');
  assert.equal(ticketList.hidden, false);
  assert.equal(eventList.hidden, true);
  assert.equal(ticketTab.getAttribute('aria-pressed'), 'true');

  assert.deepEqual(runtime.switchCategory('event'), {ok: true, category: 'event', action: 'switch-exchange-category'});
  assert.equal(runtime.getActiveCategory(), 'event');
  assert.equal(ticketList.hidden, true);
  assert.equal(eventList.hidden, false);
  assert.equal(eventTab.getAttribute('aria-pressed'), 'true');
  assert.equal(ticketTab.getAttribute('aria-pressed'), 'false');

  eventTab.click();
  assert.equal(runtime.getActiveCategory(), 'event');
  ticketTab.click();
  assert.equal(runtime.getActiveCategory(), 'ticket');
  assert.equal(ticketList.hidden, false);
  assert.equal(eventList.hidden, true);

  assert.deepEqual(runtime.switchCategory('missions'), {ok: false, category: 'missions', reason: 'unknown-category'});
  assert.equal(runtime.getActiveCategory(), 'ticket');
});

test('show and hide toggle the exchange view', () => {
  const documentSource = new FakeDocument();
  const panel = new FakeNode('div', documentSource);
  const runtime = mountShopExchangeRuntime({panel, documentSource});

  assert.deepEqual(runtime.showExchangeView(), {ok: true, action: 'show-exchange'});
  assert.equal(runtime.getExchangeView().hidden, false);
  assert.equal(runtime.getExchangeView().scrolledIntoView, 1);
  assert.deepEqual(runtime.hideExchangeView(), {ok: true, action: 'hide-exchange'});
  assert.equal(runtime.getExchangeView().hidden, true);
});

test('hidden exchange view and event list are really hidden by the stylesheet rule', () => {
  assert.match(SHOP_EXCHANGE_CSS, /\.shopExchangeView\[hidden\]\{display:none\}/);
  assert.match(SHOP_EXCHANGE_CSS, /\.shopExchangeList\[hidden\]\{display:none\}/);
});

test('ensure returns null without a usable document or shop screen', () => {
  assert.equal(ensureShopExchangeRuntime(undefined), null);
  assert.equal(ensureShopExchangeRuntime({}), null);
  assert.equal(ensureShopExchangeRuntime(globalThis.document), null);
});

test('ensure mounts the exchange view into the shop panel', () => {
  const documentSource = new FakeDocument();
  const shopScreen = new FakeNode('section', documentSource);
  shopScreen.dataset.screen = 'shop';
  shopScreen.querySelector = (selector) => {
    if (selector === '.shopPanel') return panel;
    return null;
  };
  const panel = new FakeNode('div', documentSource);
  documentSource.screens.push(shopScreen);
  const runtime = ensureShopExchangeRuntime(documentSource);
  assert.ok(runtime);
  assert.equal(runtime.mounted, true);
  assert.equal(runtime.getExchangeView().hidden, true);
  assert.equal(panel.children.includes(runtime.getExchangeView()), true);
});
