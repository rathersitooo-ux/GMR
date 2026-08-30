import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PARTNER_CONVERSATION_HUB_ALLOWED_ACTIONS,
  createPartnerConversationHubInput,
  mountPartnerConversationHubOverlay,
  partnerConversationHubCanDispatch,
} from '../browser/partner-shell-conversation-overlay.mjs';

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName).toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.className = '';
    this.textContent = '';
    this.type = '';
    this.hidden = false;
    this.id = '';
    this.value = '';
    this.listeners = new Map();
    this.attributes = new Map();
  }
  append(...children) { for (const child of children) { child.parentNode = this; this.children.push(child); } }
  replaceChildren(...children) { for (const child of this.children) child.parentNode = null; this.children = []; this.append(...children); }
  addEventListener(type, handler) { const list = this.listeners.get(type) ?? []; list.push(handler); this.listeners.set(type, list); }
  removeEventListener(type, handler) { const list = this.listeners.get(type) ?? []; this.listeners.set(type, list.filter((item) => item !== handler)); }
  dispatch(type, event = {}) { if (!('target' in event)) event.target = this; for (const handler of this.listeners.get(type) ?? []) handler(event); }
  click(event = {}) { this.dispatch('click', event); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  remove() { if (!this.parentNode) return; this.parentNode.children = this.parentNode.children.filter((child) => child !== this); this.parentNode = null; }
  querySelector(selector) { return findNode(this, selector); }
}

class FakeDocument {
  constructor() { this.listeners = new Map(); this.head = new FakeElement('head', this); this.body = new FakeElement('body', this); }
  createElement(tagName) { return new FakeElement(tagName, this); }
  getElementById(id) { return allNodes(this.head).concat(allNodes(this.body)).find((node) => node.id === id) ?? null; }
  addEventListener(type, handler) { const list = this.listeners.get(type) ?? []; list.push(handler); this.listeners.set(type, list); }
  removeEventListener(type, handler) { const list = this.listeners.get(type) ?? []; this.listeners.set(type, list.filter((item) => item !== handler)); }
  dispatch(type, event = {}) { for (const handler of this.listeners.get(type) ?? []) handler(event); }
}

function allNodes(root) { const out=[]; const visit=(node)=>{out.push(node); for(const child of node.children??[]) visit(child)}; visit(root); return out; }
function findNode(root, selector) {
  const predicate = selector.startsWith('.')
    ? (node) => String(node.className).split(/\s+/).includes(selector.slice(1))
    : selector === '[data-gr-partner-conversation="1"]'
      ? (node) => node.dataset?.grPartnerConversation === '1'
      : () => false;
  for (const node of allNodes(root).slice(1)) if (predicate(node)) return node;
  return null;
}
function byAction(root, action) { return allNodes(root).find((node) => node.dataset?.partnerShellAction === action) ?? null; }
function byDataset(root, key) { return allNodes(root).find((node) => node.dataset?.[key] === '1') ?? null; }
function makeConversation() {
  const doc = new FakeDocument();
  const root = doc.createElement('section'); root.dataset.grPartnerConversation = '1';
  const header = doc.createElement('div'); header.className = 'grPartnerConversationHead';
  const input = doc.createElement('textarea'); input.className = 'grPartnerConversationInput'; input.value = '送信前の相談メモ';
  root.append(header, input); doc.body.append(root);
  return { doc, root, header, input };
}

test('policy exposes only current honest conversation-side Hub actions', () => {
  assert.deepEqual(PARTNER_CONVERSATION_HUB_ALLOWED_ACTIONS, ['OPEN_ACTIVE_DETAIL', 'OPEN_CONVERSATION', 'BACK_HUB']);
  assert.equal(partnerConversationHubCanDispatch('OPEN_ACTIVE_DETAIL'), true);
  assert.equal(partnerConversationHubCanDispatch('OPEN_CONVERSATION'), true);
  assert.equal(partnerConversationHubCanDispatch('BACK_HUB'), true);
  for (const blocked of ['OPEN_LIST', 'OPEN_FORMATION', 'OPEN_STRATEGY', 'OPEN_TEA', 'OPEN_DETAIL', 'BACK_LIST']) {
    assert.equal(partnerConversationHubCanDispatch(blocked), false, blocked);
  }
});

test('input is fixed to current Saasuna identity without relationship, reward, save, formation or strategy authority', () => {
  const input = createPartnerConversationHubInput('detail');
  assert.equal(input.activePartnerId, 'partner.saasuna');
  assert.equal(input.roster.length, 1);
  assert.equal(input.roster[0].displayName, 'サースナー');
  assert.deepEqual(input.formationPartnerIds, []);
  assert.equal(input.strategyId, null);
  const serialized = JSON.stringify(input);
  for (const forbidden of ['relationship', 'intimacy', 'reward', 'coins', 'save']) assert.equal(serialized.includes(forbidden), false);
});

test('mount is fail-closed to the actual Partner conversation surface', () => {
  const doc = new FakeDocument();
  const wrongRoot = doc.createElement('section');
  assert.throws(() => mountPartnerConversationHubOverlay({ conversationRoot: wrongRoot }), /mounted Partner conversation surface/);
});

test('direct conversation stays default and opening Hub preserves draft and existing DOM', () => {
  const { root, header, input } = makeConversation();
  const runtime = mountPartnerConversationHubOverlay({ conversationRoot: root });
  const trigger = byDataset(root, 'partnerHubTrigger');
  const overlay = byDataset(root, 'partnerHubOverlay');
  assert.ok(trigger);
  assert.ok(overlay);
  assert.equal(header.children.includes(trigger), true);
  assert.equal(overlay.hidden, true);
  assert.equal(input.value, '送信前の相談メモ');
  assert.equal(runtime.snapshot().directConversationDefault, true);

  trigger.click();
  assert.equal(overlay.hidden, false);
  assert.equal(runtime.snapshot().open, true);
  assert.equal(runtime.snapshot().view, 'hub');
  assert.equal(input.value, '送信前の相談メモ');
  assert.ok(byAction(overlay, 'OPEN_ACTIVE_DETAIL'));
  assert.ok(byAction(overlay, 'OPEN_CONVERSATION'));
  assert.equal(byAction(overlay, 'OPEN_LIST'), null);
  assert.equal(byAction(overlay, 'OPEN_FORMATION'), null);
  assert.equal(byAction(overlay, 'OPEN_STRATEGY'), null);
  assert.equal(byAction(overlay, 'OPEN_TEA'), null);
});

test('detail navigation is local and returns to Hub without exposing the disabled list', () => {
  const { root } = makeConversation();
  const runtime = mountPartnerConversationHubOverlay({ conversationRoot: root });
  runtime.open();
  const overlay = byDataset(root, 'partnerHubOverlay');
  byAction(overlay, 'OPEN_ACTIVE_DETAIL').click();
  assert.equal(runtime.snapshot().view, 'detail');
  assert.ok(byAction(overlay, 'BACK_HUB'));
  assert.equal(byAction(overlay, 'BACK_LIST'), null);
  byAction(overlay, 'BACK_HUB').click();
  assert.equal(runtime.snapshot().view, 'hub');
});

test('Talk action and outside tap close only the overlay and keep conversation state intact', () => {
  const { root, input } = makeConversation();
  const runtime = mountPartnerConversationHubOverlay({ conversationRoot: root });
  runtime.open();
  const overlay = byDataset(root, 'partnerHubOverlay');
  byAction(overlay, 'OPEN_CONVERSATION').click();
  assert.equal(runtime.snapshot().open, false);
  assert.equal(overlay.hidden, true);
  assert.equal(input.value, '送信前の相談メモ');

  runtime.open();
  let prevented = false; let stopped = false;
  overlay.click({ target: overlay, preventDefault(){prevented=true;}, stopPropagation(){stopped=true;} });
  assert.equal(runtime.snapshot().open, false);
  assert.equal(prevented, true);
  assert.equal(stopped, true);
  assert.equal(input.value, '送信前の相談メモ');
});

test('Escape closes and destroy removes only overlay-owned DOM', () => {
  const { doc, root, input } = makeConversation();
  const runtime = mountPartnerConversationHubOverlay({ conversationRoot: root });
  runtime.open();
  doc.dispatch('keydown', { key:'Escape', preventDefault(){}, stopPropagation(){} });
  assert.equal(runtime.snapshot().open, false);
  assert.equal(runtime.destroy(), true);
  assert.equal(byDataset(root, 'partnerHubTrigger'), null);
  assert.equal(byDataset(root, 'partnerHubOverlay'), null);
  assert.equal(input.parentNode, root);
  assert.equal(input.value, '送信前の相談メモ');
  assert.equal(runtime.destroy(), false);
});
