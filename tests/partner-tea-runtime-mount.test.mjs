import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PARTNER_CONVERSATION_HUB_ALLOWED_ACTIONS,
  createPartnerConversationHubInput,
  mountPartnerTeaQuickChoiceRuntime,
  partnerConversationHubCanDispatch,
  partnerConversationHubProjectionPlan,
  partnerTeaQuickChoiceProjectionPlan,
  projectPartnerConversationHubOverlay,
  projectPartnerTeaQuickChoices,
} from '../browser/partner-tea-runtime-mount.mjs';

function datasetKey(attribute) {
  return attribute.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

function classTokens(node) {
  return String(node?.className || '').split(/\s+/).filter(Boolean);
}

function matches(node, selector) {
  if (!node || typeof selector !== 'string') return false;
  if (selector.startsWith('.')) return classTokens(node).includes(selector.slice(1));
  if (selector.startsWith('form.')) {
    return node.tag === 'form' && classTokens(node).includes(selector.slice(5));
  }
  const attr = selector.match(/^\[data-([a-z0-9-]+)="([^"]*)"\]$/i);
  if (attr) return String(node.dataset?.[datasetKey(`data-${attr[1]}`)] ?? '') === attr[2];
  return false;
}

function descendants(root) {
  const out = [];
  const visit = (node) => {
    for (const child of node?.children || []) {
      out.push(child);
      visit(child);
    }
  };
  visit(root);
  return out;
}

function element(tag = 'div', ownerDocument = null) {
  return {
    tag,
    id: '',
    className: '',
    dataset: {},
    textContent: '',
    type: '',
    value: '',
    disabled: false,
    hidden: false,
    tabIndex: 0,
    children: [],
    listeners: new Map(),
    attributes: new Map(),
    ownerDocument,
    parent: null,
    parentNode: null,
    focused: false,
    appendChild(child) {
      if (!child) return child;
      child.parent = this;
      child.parentNode = this;
      if (!child.ownerDocument) child.ownerDocument = this.ownerDocument;
      this.children.push(child);
      return child;
    },
    append(...children) { for (const child of children) this.appendChild(child); },
    replaceChildren(...children) {
      for (const child of this.children) {
        child.parent = null;
        child.parentNode = null;
      }
      this.children = [];
      this.append(...children);
    },
    before(node) {
      this.insertedBefore = node;
      if (!this.parent) return;
      const index = this.parent.children.indexOf(this);
      if (index < 0) return;
      node.parent = this.parent;
      node.parentNode = this.parent;
      if (!node.ownerDocument) node.ownerDocument = this.ownerDocument;
      this.parent.children.splice(index, 0, node);
    },
    remove() {
      if (!this.parent) return;
      const index = this.parent.children.indexOf(this);
      if (index >= 0) this.parent.children.splice(index, 1);
      this.parent = null;
      this.parentNode = null;
    },
    setAttribute(name, value) { this.attributes.set(name, String(value)); },
    getAttribute(name) { return this.attributes.get(name) ?? null; },
    addEventListener(type, listener) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(listener);
    },
    dispatch(type, event = {}) {
      const normalized = {
        target: this,
        preventDefault() {},
        stopPropagation() {},
        ...event,
      };
      for (const listener of this.listeners.get(type) || []) listener(normalized);
    },
    click() {
      if (this.disabled) return;
      this.dispatch('click');
    },
    focus() { this.focused = true; },
    querySelector(selector) {
      return descendants(this).find((node) => matches(node, selector)) || null;
    },
    querySelectorAll(selector) {
      return descendants(this).filter((node) => matches(node, selector));
    },
  };
}

function teaFixture({ draft = '下書き' } = {}) {
  const document = {
    head: null,
    body: null,
    documentElement: null,
    getElementById(id) {
      return [this.head, ...descendants(this.head), this.body, ...descendants(this.body)]
        .find((node) => node?.id === id) || null;
    },
    createElement(tag) { return element(tag, this); },
    querySelectorAll(selector) {
      const roots = [this.body, this.head].filter(Boolean);
      const nodes = roots.flatMap((root) => [root, ...descendants(root)]);
      return nodes.filter((node) => matches(node, selector));
    },
  };
  document.head = element('head', document);
  document.body = element('body', document);
  document.documentElement = element('html', document);

  const surface = document.createElement('section');
  surface.dataset.grPartnerConversation = '1';
  surface.className = 'grPartnerConversation';

  const head = document.createElement('div');
  head.className = 'grPartnerConversationHead';
  surface.appendChild(head);

  const input = document.createElement('textarea');
  input.className = 'grPartnerConversationInput';
  input.value = draft;
  const send = document.createElement('button');
  send.className = 'grPartnerConversationSend';
  const form = document.createElement('form');
  form.className = 'grPartnerConversationComposer';
  form.submittedValues = [];
  form.requestSubmit = () => {
    form.submittedValues.push(input.value);
    input.value = '';
    input.disabled = true;
    send.disabled = true;
  };
  form.append(input, send);
  surface.appendChild(form);
  document.body.appendChild(surface);

  return { document, surface, head, form, input, send };
}

function allNodes(root) {
  return [root, ...descendants(root)];
}

test('Tea runtime plan exposes only the approved two choices and no mutation authority', () => {
  const plan = partnerTeaQuickChoiceProjectionPlan();
  assert.deepEqual(plan.choices, [
    { id: 'study', label: '勉強する' },
    { id: 'consult', label: '相談する' },
  ]);
  assert.equal(plan.minimumTargetPx, 44);
  assert.equal(plan.reusesConversationForm, true);
  assert.equal(plan.createsConversationSession, false);
  assert.equal(plan.relationshipMutationAllowed, false);
  assert.equal(plan.rewardMutationAllowed, false);
  assert.equal(plan.saveMutationAllowed, false);
  assert.equal(Object.isFrozen(plan), true);
});

test('Partner Hub plan composes the current Shell without inventing conversation or mutation authority', () => {
  const plan = partnerConversationHubProjectionPlan();
  assert.equal(plan.presentation, 'secondary_nonblocking_overlay');
  assert.equal(plan.useSite, 'partner-conversation');
  assert.equal(plan.activePartnerId, 'partner.saasuna');
  assert.equal(plan.directConversationDefault, true);
  assert.equal(plan.conversationDomPreserved, true);
  assert.equal(plan.createsConversationSession, false);
  assert.equal(plan.relationshipMutationAllowed, false);
  assert.equal(plan.rewardMutationAllowed, false);
  assert.equal(plan.saveMutationAllowed, false);
  assert.equal(plan.gameplayMutationAllowed, false);
  assert.equal(plan.canonMutationAllowed, false);
  assert.deepEqual(plan.allowedActions, ['OPEN_ACTIVE_DETAIL', 'OPEN_CONVERSATION', 'BACK_HUB']);
  assert.equal(Object.isFrozen(plan), true);
});

test('Partner Hub dispatcher exposes only detail, conversation and return-to-hub actions', () => {
  assert.deepEqual(PARTNER_CONVERSATION_HUB_ALLOWED_ACTIONS, ['OPEN_ACTIVE_DETAIL', 'OPEN_CONVERSATION', 'BACK_HUB']);
  for (const action of PARTNER_CONVERSATION_HUB_ALLOWED_ACTIONS) assert.equal(partnerConversationHubCanDispatch(action), true);
  for (const action of ['OPEN_LIST', 'OPEN_COSTUME', 'OPEN_FORMATION', 'OPEN_STRATEGY', 'OPEN_DIALOGUE_FEEDBACK', 'OPEN_TEA']) {
    assert.equal(partnerConversationHubCanDispatch(action), false);
  }
  assert.equal(createPartnerConversationHubInput().activePartnerId, 'partner.saasuna');
  assert.equal(createPartnerConversationHubInput().roster.length, 1);
});

test('mount is a no-op when browser DOM lifecycle is unavailable', () => {
  assert.equal(mountPartnerTeaQuickChoiceRuntime({}), null);
  assert.equal(mountPartnerTeaQuickChoiceRuntime({ document: {} }), null);
});

test('projects two touch-sized Tea actions into the existing conversation form', () => {
  const fixture = teaFixture();
  const count = projectPartnerTeaQuickChoices({ document: fixture.document });
  assert.equal(count, 1);
  const bar = fixture.form.insertedBefore;
  assert.equal(bar.dataset.grPartnerTeaQuickChoice, '1');
  assert.equal(bar.children[0].textContent, 'お茶会');
  const buttons = bar.children.slice(1);
  assert.equal(buttons.length, 2);
  assert.deepEqual(buttons.map((button) => [button.dataset.choiceId, button.textContent]), [
    ['study', '勉強する'],
    ['consult', '相談する'],
  ]);
  assert.deepEqual(buttons.map((button) => button.disabled), [false, false]);
  assert.deepEqual(buttons.map((button) => button.dataset.grPartnerTeaPressState), ['idle', 'idle']);
});

test('live conversation projection adds one Partner trigger without replacing the direct conversation DOM', () => {
  const fixture = teaFixture({ draft: '残す下書き' });
  const originalForm = fixture.form;
  const originalInput = fixture.input;
  assert.equal(projectPartnerConversationHubOverlay({ document: fixture.document }), 1);
  const trigger = fixture.surface.querySelector('[data-partner-hub-trigger="1"]');
  const overlay = fixture.surface.querySelector('[data-partner-hub-overlay="1"]');
  assert.ok(trigger);
  assert.ok(overlay);
  assert.equal(trigger.textContent, 'パートナー');
  assert.equal(overlay.hidden, true);
  assert.equal(fixture.surface.querySelector('form.grPartnerConversationComposer'), originalForm);
  assert.equal(fixture.surface.querySelector('.grPartnerConversationInput'), originalInput);
  assert.equal(originalInput.value, '残す下書き');
  assert.equal(projectPartnerConversationHubOverlay({ document: fixture.document }), 0);
  assert.equal(fixture.surface.querySelectorAll('[data-partner-hub-trigger="1"]').length, 1);
});

test('Partner trigger opens the existing Shell hub with approved idle line and no dead unsupported actions', () => {
  const fixture = teaFixture();
  projectPartnerTeaQuickChoices({ document: fixture.document });
  const trigger = fixture.surface.querySelector('[data-partner-hub-trigger="1"]');
  const overlay = fixture.surface.querySelector('[data-partner-hub-overlay="1"]');
  trigger.click();
  assert.equal(overlay.hidden, false);

  const nodes = allNodes(overlay);
  const shell = nodes.find((node) => node.dataset?.partnerShellView === 'hub');
  assert.ok(shell);
  const idle = nodes.find((node) => node.className === 'partner-shell-idle-readable');
  assert.ok(idle);
  assert.equal(idle.dataset.partnerId, 'partner.saasuna');
  assert.equal(idle.dataset.sourceState, 'approved_current');
  assert.equal(idle.dataset.presentationOnly, 'true');
  assert.ok(idle.textContent.length > 0);

  const actions = nodes
    .filter((node) => node.dataset?.partnerShellAction)
    .map((node) => node.dataset.partnerShellAction);
  assert.deepEqual(actions, ['OPEN_ACTIVE_DETAIL', 'OPEN_CONVERSATION']);
  assert.equal(actions.includes('OPEN_COSTUME'), false);
  assert.equal(actions.includes('OPEN_LIST'), false);
  assert.equal(fixture.input.value, '下書き');
});

test('Partner Shell detail and conversation actions stay inside the current conversation surface', () => {
  const fixture = teaFixture();
  projectPartnerTeaQuickChoices({ document: fixture.document });
  const trigger = fixture.surface.querySelector('[data-partner-hub-trigger="1"]');
  const overlay = fixture.surface.querySelector('[data-partner-hub-overlay="1"]');
  trigger.click();

  const detail = allNodes(overlay).find((node) => node.dataset?.partnerShellAction === 'OPEN_ACTIVE_DETAIL');
  detail.click();
  assert.ok(allNodes(overlay).some((node) => node.dataset?.partnerShellView === 'detail'));
  assert.ok(allNodes(overlay).some((node) => node.textContent === 'サースナー'));
  const back = allNodes(overlay).find((node) => node.dataset?.partnerShellAction === 'BACK_HUB');
  back.click();
  assert.ok(allNodes(overlay).some((node) => node.dataset?.partnerShellView === 'hub'));

  const talk = allNodes(overlay).find((node) => node.dataset?.partnerShellAction === 'OPEN_CONVERSATION');
  talk.click();
  assert.equal(overlay.hidden, true);
  assert.equal(fixture.surface.querySelector('form.grPartnerConversationComposer'), fixture.form);
});

test('Partner Hub close, backdrop and Escape only close the overlay', () => {
  const fixture = teaFixture();
  projectPartnerTeaQuickChoices({ document: fixture.document });
  const trigger = fixture.surface.querySelector('[data-partner-hub-trigger="1"]');
  const overlay = fixture.surface.querySelector('[data-partner-hub-overlay="1"]');
  const close = fixture.surface.querySelector('[data-partner-hub-close="1"]');

  trigger.click();
  close.click();
  assert.equal(overlay.hidden, true);
  assert.equal(fixture.surface.querySelector('form.grPartnerConversationComposer'), fixture.form);

  trigger.click();
  overlay.dispatch('keydown', { key: 'Escape' });
  assert.equal(overlay.hidden, true);

  trigger.click();
  overlay.dispatch('click', { target: overlay });
  assert.equal(overlay.hidden, true);
  assert.equal(fixture.input.value, '下書き');
});

test('Tea pointer press feedback is visible before commit and clears on release or cancel', () => {
  const fixture = teaFixture();
  projectPartnerTeaQuickChoices({ document: fixture.document });
  const study = fixture.form.insertedBefore.children[1];

  study.dispatch('pointerdown', { button: 0 });
  assert.equal(study.dataset.grPartnerTeaPressState, 'pressed');
  assert.deepEqual(fixture.form.submittedValues, []);

  study.dispatch('pointerup');
  assert.equal(study.dataset.grPartnerTeaPressState, 'idle');
  assert.deepEqual(fixture.form.submittedValues, []);

  study.dispatch('pointerdown', { button: 0 });
  assert.equal(study.dataset.grPartnerTeaPressState, 'pressed');
  study.dispatch('pointerleave');
  assert.equal(study.dataset.grPartnerTeaPressState, 'idle');

  study.dispatch('pointerdown', { button: 2 });
  assert.equal(study.dataset.grPartnerTeaPressState, 'idle');
});

test('Tea keyboard press feedback covers Enter and Space without synthesizing action', () => {
  const fixture = teaFixture();
  projectPartnerTeaQuickChoices({ document: fixture.document });
  const consult = fixture.form.insertedBefore.children[2];

  consult.dispatch('keydown', { key: 'Enter', repeat: false });
  assert.equal(consult.dataset.grPartnerTeaPressState, 'pressed');
  assert.deepEqual(fixture.form.submittedValues, []);
  consult.dispatch('keyup', { key: 'Enter' });
  assert.equal(consult.dataset.grPartnerTeaPressState, 'idle');

  consult.dispatch('keydown', { key: ' ', repeat: false });
  assert.equal(consult.dataset.grPartnerTeaPressState, 'pressed');
  consult.dispatch('blur');
  assert.equal(consult.dataset.grPartnerTeaPressState, 'idle');
  assert.deepEqual(fixture.form.submittedValues, []);
});

test('Tea click reuses the existing submit path and preserves a free-talk draft', () => {
  const fixture = teaFixture({ draft: 'あとで送る下書き' });
  projectPartnerTeaQuickChoices({ document: fixture.document });
  const study = fixture.form.insertedBefore.children[1];
  study.click();
  assert.deepEqual(fixture.form.submittedValues, ['勉強する']);
  assert.equal(fixture.input.value, 'あとで送る下書き');
  assert.equal(fixture.input.disabled, true);
  assert.equal(fixture.send.disabled, true);
});

test('Tea quick choices mirror the existing conversation busy state, clear pressed state, and recover', () => {
  const fixture = teaFixture();
  projectPartnerTeaQuickChoices({ document: fixture.document });
  const buttons = fixture.form.insertedBefore.children.slice(1);

  buttons[0].dispatch('pointerdown', { button: 0 });
  assert.equal(buttons[0].dataset.grPartnerTeaPressState, 'pressed');

  fixture.input.disabled = true;
  fixture.send.disabled = true;
  assert.equal(projectPartnerTeaQuickChoices({ document: fixture.document }), 0);
  assert.deepEqual(buttons.map((button) => button.disabled), [true, true]);
  assert.deepEqual(buttons.map((button) => button.dataset.grPartnerTeaPressState), ['idle', 'idle']);

  buttons[0].dispatch('pointerdown', { button: 0 });
  assert.equal(buttons[0].dataset.grPartnerTeaPressState, 'idle');
  buttons[0].click();
  assert.deepEqual(fixture.form.submittedValues, []);

  fixture.input.disabled = false;
  fixture.send.disabled = false;
  assert.equal(projectPartnerTeaQuickChoices({ document: fixture.document }), 0);
  assert.deepEqual(buttons.map((button) => button.disabled), [false, false]);

  buttons[1].click();
  assert.deepEqual(fixture.form.submittedValues, ['相談する']);
});

test('projection is idempotent on an already-mounted conversation surface', () => {
  const fixture = teaFixture();
  assert.equal(projectPartnerTeaQuickChoices({ document: fixture.document }), 1);
  assert.equal(projectPartnerTeaQuickChoices({ document: fixture.document }), 0);
  assert.equal(fixture.surface.querySelectorAll('[data-partner-hub-trigger="1"]').length, 1);
  assert.equal(fixture.surface.querySelectorAll('[data-partner-hub-overlay="1"]').length, 1);
});

test('runtime observes future surfaces and disabled-state changes and fails closed on global collision', () => {
  const fixture = teaFixture();
  let observerCallback = null;
  let observedOptions = null;
  let disconnected = false;
  class FakeObserver {
    constructor(callback) { observerCallback = callback; }
    observe(target, options) { this.target = target; observedOptions = options; }
    disconnect() { disconnected = true; }
  }
  const global = { document: fixture.document, MutationObserver: FakeObserver };
  const runtime = mountPartnerTeaQuickChoiceRuntime(global);
  assert.equal(runtime.version, 'gameroad.partner-tea-quick-choice-runtime.v1');
  assert.equal(runtime.partnerHubPlan.directConversationDefault, true);
  assert.equal(typeof observerCallback, 'function');
  assert.deepEqual(observedOptions, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['disabled'],
  });
  assert.equal(mountPartnerTeaQuickChoiceRuntime(global), runtime);
  runtime.disconnect();
  assert.equal(disconnected, true);

  assert.throws(() => mountPartnerTeaQuickChoiceRuntime({
    document: fixture.document,
    MutationObserver: FakeObserver,
    GAMEROAD_PARTNER_TEA_QUICK_CHOICE_RUNTIME: { version: 'foreign' },
  }), /PARTNER_TEA_RUNTIME_GLOBAL_COLLISION/);
});
