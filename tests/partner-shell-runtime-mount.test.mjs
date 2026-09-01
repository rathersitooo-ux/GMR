import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPartnerShellRuntimeModel,
  mountPartnerShellRuntime,
} from '../browser/partner-shell-runtime-mount.mjs';

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName).toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.dataset = {};
    this.className = '';
    this.textContent = '';
    this.type = '';
    this.listeners = new Map();
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = [...children]; }
  addEventListener(type, handler) { this.listeners.set(type, handler); }
  click() { this.listeners.get('click')?.(); }
}

class FakeDocument {
  createElement(tagName) { return new FakeElement(tagName, this); }
}

function allNodes(root) {
  const out = [];
  const visit = (node) => {
    out.push(node);
    for (const child of node.children ?? []) visit(child);
  };
  visit(root);
  return out;
}

const roster = [
  { partnerId: 'partner.saasuna', displayName: 'サースナー', portraitRef: 'saasuna.current' },
  { partnerId: 'partner.other', displayName: 'Other' },
];

function makeRoot() {
  const doc = new FakeDocument();
  return new FakeElement('div', doc);
}

test('runtime model fail-closes hub actions that have no concrete dispatcher', () => {
  const model = buildPartnerShellRuntimeModel({ activePartnerId: 'partner.saasuna', roster });
  assert.equal(model.view, 'hub');
  assert.equal(model.activePartner.displayName, 'サースナー');
  assert.deepEqual(model.menuActions, []);
  assert.equal(model.deadButtonAllowed, false);
  assert.equal(model.readOnlyProjection, true);
});

test('runtime model exposes only explicitly connected hub actions', () => {
  const allowed = new Set(['OPEN_ACTIVE_DETAIL', 'OPEN_CONVERSATION']);
  const model = buildPartnerShellRuntimeModel(
    { activePartnerId: 'partner.saasuna', roster },
    { canDispatch: (action) => allowed.has(action) },
  );
  assert.deepEqual(model.menuActions.map((item) => item.action), ['OPEN_ACTIVE_DETAIL', 'OPEN_CONVERSATION']);
  assert.deepEqual(model.menuActions.map((item) => item.label), ['人物詳細', '話す']);
  assert.equal(model.menuActions.some((item) => item.action === 'OPEN_TEA'), false);
});

test('list detail buttons carry partner identity but never change active partner', () => {
  const input = { activePartnerId: 'partner.saasuna', roster, view: 'list' };
  const before = structuredClone(input);
  const model = buildPartnerShellRuntimeModel(input, {
    canDispatch: (action, context) => action === 'OPEN_DETAIL' && context.partnerId === 'partner.other',
  });
  assert.deepEqual(input, before);
  assert.equal(model.roster[0].detailAction, null);
  assert.equal(model.roster[1].detailAction.partnerId, 'partner.other');
  assert.equal(model.activePartnerId, 'partner.saasuna');
});

test('mount renders connected actions and dispatches intent without local navigation', () => {
  const root = makeRoot();
  const events = [];
  const runtime = mountPartnerShellRuntime({
    root,
    getInput: () => ({ activePartnerId: 'partner.saasuna', roster, view: 'hub' }),
    canDispatch: (action) => action === 'OPEN_ACTIVE_DETAIL',
    onAction: (event) => events.push(event),
  });

  const result = runtime.render();
  assert.equal(result.ok, true);
  assert.equal(root.children[0].dataset.partnerShellView, 'hub');
  const buttons = allNodes(root).filter((node) => node.tagName === 'BUTTON');
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0].textContent, '人物詳細');
  buttons[0].click();
  assert.deepEqual(events, [{
    action: 'OPEN_ACTIVE_DETAIL',
    targetView: 'detail',
    partnerId: null,
    sourceView: 'hub',
  }]);
  assert.equal(runtime.getLastModel().view, 'hub');
});

test('invalid caller state clears the mount instead of auto-picking or inventing Partner state', () => {
  const root = makeRoot();
  root.append(root.ownerDocument.createElement('div'));
  const runtime = mountPartnerShellRuntime({ root, getInput: () => ({ roster }) });
  const result = runtime.render();
  assert.deepEqual(result, { ok: false, reason: 'INVALID_INPUT', model: null });
  assert.equal(root.children.length, 0);
});

test('relationship, reward and private save payloads never leak into runtime model', () => {
  const model = buildPartnerShellRuntimeModel({
    activePartnerId: 'partner.saasuna',
    roster,
    view: 'strategy',
    strategyId: 'strategy.current',
    relationship: { intimacy: 999 },
    reward: { coins: 999 },
    save: { write: true },
  }, { canDispatch: () => true });
  const serialized = JSON.stringify(model);
  assert.equal(serialized.includes('intimacy'), false);
  assert.equal(serialized.includes('coins'), false);
  assert.equal(serialized.includes('write'), false);
  assert.equal(model.strategyId, 'strategy.current');
});

test('destroy removes rendered shell and makes later renders inert', () => {
  const root = makeRoot();
  const runtime = mountPartnerShellRuntime({
    root,
    getInput: () => ({ activePartnerId: 'partner.saasuna', roster }),
    canDispatch: () => true,
  });
  assert.equal(runtime.render().ok, true);
  assert.equal(runtime.destroy(), true);
  assert.equal(root.children.length, 0);
  assert.deepEqual(runtime.render(), { ok: false, reason: 'DESTROYED', model: null });
});

test('conversation view binds the current Saasuna entry and renders only approved output', async () => {
  const root = makeRoot();
  const runtime = mountPartnerShellRuntime({
    root,
    getInput: () => ({ activePartnerId: 'partner.saasuna', roster, view: 'conversation' }),
    canDispatch: (action) => action === 'BACK_HUB',
    createConversationSessionId: () => 'session-shell',
  });

  assert.equal(runtime.render().ok, true);
  assert.ok(allNodes(root).some((node) => node.dataset.partnerConversationInput === 'message'));
  const output = await runtime.sendConversationMessage('話そう');
  assert.equal(output.turn.ok, true);
  assert.equal(output.turn.responseOrigin, 'approved_fallback');
  const utterances = allNodes(root).filter((node) => node.className === 'partner-shell-conversation-utterance');
  assert.deepEqual(utterances.map((node) => node.textContent), [output.turn.utterance]);
  const state = runtime.getConversationState();
  assert.equal(state.available, true);
  assert.equal(state.turns[0].utterance, output.turn.utterance);
  assert.equal(JSON.stringify(state).includes('話そう'), false);
});

test('conversation view never borrows Saasuna dialogue for another partner', async () => {
  const root = makeRoot();
  const runtime = mountPartnerShellRuntime({
    root,
    getInput: () => ({ activePartnerId: 'partner.other', roster, view: 'conversation' }),
    canDispatch: (action) => action === 'BACK_HUB',
  });

  assert.equal(runtime.render().ok, true);
  assert.equal(allNodes(root).some((node) => node.dataset.partnerConversationInput === 'message'), false);
  assert.ok(allNodes(root).some((node) => node.className === 'partner-shell-conversation-unavailable'));
  assert.deepEqual(await runtime.sendConversationMessage('話そう'), {
    ok: false,
    reason: 'CONVERSATION_SOURCE_UNAVAILABLE',
  });
});
